/**
 * Availability ingest — per-night status for every site, fetched in parallel.
 *
 * Reads vendor IDs from the `sites` table (populated by metadata ingest), so
 * no map-tree walking required — we go straight from "list of sites" to
 * "per-resource daily availability calls" with bounded concurrency.
 *
 * Target cadence: short windows frequently, full 180-day horizons on a slower
 * cadence. Metadata, photos, maps, and resource details are handled by the
 * metadata ingest, not this hot path.
 *
 * Writes are batched UPSERTs into `site_availability` (PRIMARY KEY (site_id,
 * night_date)) so a partial run preserves prior nightly data and an interrupted
 * run is safe to resume.
 */

import { CamisClient } from "./camis-client";
import { CampspotClient, decodeCampspotStatus, type CampspotAvailabilityRow } from "./campspot-client";
import { CamplifeClient, decodeCamplifeStatus, type CamplifeAvailabilityResponse } from "./camplife-client";
import { LetsCampClient, type LetsCampCamp, type LetsCampSearchResponse } from "./letscamp-client";
import { appDate } from "../app-time";
import { addDays } from "./provider-utils";
import {
  upsertSiteAvailabilityBatch,
  startRefreshLog,
  finishRefreshLog,
  setRefreshMeta,
  pruneStaleAvailability,
  refreshRollups,
  refreshAggregates,
  type SiteNight,
} from "../db/queries";
import { sqlDirect } from "../db/client";
import type { Vendor } from "../types";

type AvailabilityCode = "available" | "reserved" | "closed" | "unknown";

/**
 * `processedAvailability` is what the booking UI actually shows the user — it
 * accounts for arrival/departure pairing rules, min-stay, and operator-specific
 * lockouts. `availability` is the raw per-night code; if you read it directly,
 * you wildly overstate availability because every "free" night that's stuck
 * between two booked nights still shows raw `availability: 0`.
 *
 * Observed codes (Camis5, May 2026):
 *   0 = bookable
 *   1 = restricted by operator rule (boxed in, min-stay, party-size limit, …)
 *   2 = outside operator's booking window (closed for season / not yet open)
 *   3 = closed for season / maintenance
 *   5 = reserved (booked, or boxed-in by neighbouring bookings)
 *
 * For our index we treat anything that isn't bookable-right-now as reserved,
 * except codes 2/3 which mean the season is closed.
 */
function decodeAvailability(row: { availability: number; processedAvailability?: number }): AvailabilityCode {
  const code = row.processedAvailability ?? row.availability;
  if (code === 0) return "available";
  if (code === 2 || code === 3) return "closed";
  return "reserved";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchTarget = {
  site_id: string;
  vendor_site_id: string;
  vendor_park_id: string;
  vendor_resource_location_id: number;
  vendor_resource_id: number;
  vendor_booking_category_id: number;
  operator_id: string;
  operator_vendor: Vendor;
  operator_base_url: string;
  equipment_category_id: number;
  sub_equipment_category_id: number;
};

/**
 * Build the work queue: every site we know about, joined with its operator's
 * fetch config. Returns one record per site.
 */
async function loadFetchTargets(
  opts: Pick<AvailabilityRefreshOptions, "missingOnly" | "staleHours"> & { missingDate?: string } = {},
): Promise<FetchTarget[]> {
  const missingDate = opts.missingDate ?? appDate();
  const rows = await sqlDirect()<FetchTarget[]>`
    SELECT s.id              AS site_id,
           s.vendor_site_id,
           p.vendor_park_id,
           s.vendor_resource_location_id,
           s.vendor_resource_id,
           s.vendor_booking_category_id,
           o.id              AS operator_id,
           o.vendor          AS operator_vendor,
           o.base_url        AS operator_base_url,
           ofc.equipment_category_id,
           ofc.sub_equipment_category_id
      FROM sites s
      JOIN campgrounds c           ON c.id = s.campground_id
      JOIN parks p                 ON p.id = c.park_id
      JOIN operators o             ON o.id = p.operator_id
      JOIN operator_fetch_config ofc ON ofc.operator_id = o.id
     WHERE s.vendor_resource_location_id IS NOT NULL
       AND s.vendor_resource_id IS NOT NULL
       ${opts.missingOnly ? sqlDirect()`AND NOT EXISTS (
         SELECT 1 FROM site_availability sa
          WHERE sa.site_id = s.id
            AND sa.night_date = ${missingDate}::date
       )` : sqlDirect()``}
       ${opts.staleHours != null ? sqlDirect()`AND NOT EXISTS (
         SELECT 1 FROM site_availability sa
          WHERE sa.site_id = s.id
            AND sa.night_date = ${missingDate}::date
            AND sa.last_checked_at > now() - (${opts.staleHours} * interval '1 hour')
       )` : sqlDirect()``}
     ORDER BY s.id
  `;
  return rows.map((r) => ({ ...r }));
}

function letsCampStatusForSite(siteId: string, responses: LetsCampSearchResponse[]): AvailabilityCode {
  const available = new Set<string>();
  const blocked = new Set<string>();
  for (const response of responses) {
    for (const site of response.sites ?? []) available.add(site._id);
    for (const id of response.metaData?.availabilityInfo?.bookedSiteIds ?? []) blocked.add(id);
    for (const id of response.metaData?.availabilityInfo?.lockedSiteIds ?? []) blocked.add(id);
  }
  if (available.has(siteId)) return "available";
  if (blocked.has(siteId)) return "reserved";
  return "reserved";
}

export type AvailabilityRefreshOptions = {
  /** Number of concurrent in-flight requests across all operators. */
  concurrency?: number;
  /** Per-worker request delay in ms (added jitter on top). The CamisClient
   *  enforces its own polite cadence per-instance, but each worker has its
   *  own client, so total throughput = concurrency × (1000 / requestDelayMs). */
  requestDelayMs?: number;
  /** Days ahead of today to fetch. */
  daysAhead?: number;
  /** Days from today to skip. Default 0 — operators don't actually freeze a
   *  near-term window; the earlier 14 assumed otherwise and was wrong. */
  daysSkip?: number;
  /** Maximum sites to fetch (for testing). */
  maxSites?: number;
  /** Optional filter — only fetch sites for these operator IDs. */
  operatorIds?: string[];
  /** Only fetch sites that do not have a row for CURRENT_DATE yet. */
  missingOnly?: boolean;
  /** Only fetch sites whose CURRENT_DATE row is missing or older than N hours. */
  staleHours?: number;
  /** Deterministically fetch one shard of the target list. */
  shardCount?: number;
  /** Zero-based shard index to fetch. */
  shardIndex?: number;
  /** Also refresh analytics materialized views. Keep off for frequent runs. */
  refreshAnalytics?: boolean;
  /** Batch size for SQLite UPSERTs. */
  writeBatchSize?: number;
};

export async function refreshAvailability(
  opts: AvailabilityRefreshOptions = {},
  log: (m: string) => void = () => {},
): Promise<{ sites_seen: number; sites_updated: number; nights_updated: number; errors: string[]; duration_ms: number; }> {
  const concurrency = opts.concurrency ?? 8;
  const requestDelayMs = opts.requestDelayMs ?? 250;
  // Fetch from today forward through ~6 months. The earlier defaults skipped
  // the first 14 days under a (wrong) assumption that operators freeze that
  // window — Ontario Parks/PCRS actually open new dates 5 months out and the
  // first 14 days are very much bookable. Starting at 0 means "tonight" rows
  // really exist in the table.
  const daysAhead = opts.daysAhead ?? 180;
  const daysSkip = opts.daysSkip ?? 0;
  const writeBatchSize = opts.writeBatchSize ?? 500;

  const started = Date.now();
  const today = appDate();
  const startStr = addDays(today, daysSkip);
  const endStr = addDays(startStr, daysAhead);

  let targets = await loadFetchTargets({ missingOnly: opts.missingOnly, staleHours: opts.staleHours, missingDate: startStr });
  if (opts.operatorIds && opts.operatorIds.length) {
    const allowed = new Set(opts.operatorIds);
    targets = targets.filter((t) => allowed.has(t.operator_id));
  }
  if (opts.shardCount != null) {
    const shardCount = Math.max(1, Math.floor(opts.shardCount));
    const shardIndex = Math.max(0, Math.floor(opts.shardIndex ?? 0));
    if (shardIndex >= shardCount) {
      throw new Error(`shardIndex must be between 0 and ${shardCount - 1}`);
    }
    targets = targets.filter((_, i) => i % shardCount === shardIndex);
  }
  if (opts.maxSites != null) targets = targets.slice(0, opts.maxSites);

  log(`[availability] ${targets.length} sites · window ${startStr} → ${endStr} · ${concurrency} workers`);
  if (targets.length === 0) {
    return { sites_seen: 0, sites_updated: 0, nights_updated: 0, errors: [], duration_ms: Date.now() - started };
  }

  const runId = await startRefreshLog("availability", opts.operatorIds?.join(",") ?? null);

  // Shared work queue + per-operator client cache. Each operator gets its own
  // CamisClient so the politeWait() between requests is per-host (Camis's WAF
  // sees one logical client per hostname).
  let cursor = 0;
  const clients = new Map<string, CamisClient>();
  const campspotClients = new Map<string, CampspotClient>();
  const camplifeClients = new Map<string, CamplifeClient>();
  const letsCampClients = new Map<string, LetsCampClient>();
  const campspotAvailabilityCache = new Map<string, Promise<CampspotAvailabilityRow[]>>();
  const camplifeAvailabilityCache = new Map<string, Promise<CamplifeAvailabilityResponse>>();
  const letsCampCampCache = new Map<string, Promise<LetsCampCamp>>();
  const letsCampAvailabilityCache = new Map<string, Promise<LetsCampSearchResponse[]>>();

  function clientFor(operator_id: string, base_url: string): CamisClient {
    const c = clients.get(operator_id);
    if (c) return c;
    const fresh = new CamisClient({ baseUrl: base_url, requestDelayMs });
    clients.set(operator_id, fresh);
    return fresh;
  }
  function campspotClientFor(operator_id: string, base_url: string): CampspotClient {
    const c = campspotClients.get(operator_id);
    if (c) return c;
    const fresh = new CampspotClient(base_url);
    campspotClients.set(operator_id, fresh);
    return fresh;
  }
  function camplifeClientFor(operator_id: string, base_url: string): CamplifeClient {
    const c = camplifeClients.get(operator_id);
    if (c) return c;
    const fresh = new CamplifeClient(base_url);
    camplifeClients.set(operator_id, fresh);
    return fresh;
  }
  function letsCampClientFor(operator_id: string, base_url: string): LetsCampClient {
    const c = letsCampClients.get(operator_id);
    if (c) return c;
    const fresh = new LetsCampClient(base_url);
    letsCampClients.set(operator_id, fresh);
    return fresh;
  }

  async function fetchTargetAvailability(t: FetchTarget): Promise<SiteNight[]> {
    const nowIso = new Date().toISOString();
    if (t.operator_vendor === "campspot") {
      const client = campspotClientFor(t.operator_id, t.operator_base_url);
      const out: SiteNight[] = [];
      for (let night = startStr; night < endStr; night = addDays(night, 1)) {
        const cacheKey = `${t.operator_id}:${t.vendor_park_id}:${night}`;
        let promise = campspotAvailabilityCache.get(cacheKey);
        if (!promise) {
          promise = (async () => {
            if (requestDelayMs > 0) await sleep(requestDelayMs + Math.floor(Math.random() * 100));
            return client.getAvailability({ parkId: t.vendor_park_id, startDate: night });
          })();
          campspotAvailabilityCache.set(cacheKey, promise);
        }
        const rows = await promise;
        const row = rows.find((r) => String(r.id) === t.vendor_site_id);
        out.push({
          site_id: t.site_id,
          night_date: night,
          status: decodeCampspotStatus(row),
          last_checked_at: nowIso,
        });
      }
      return out;
    }

    if (t.operator_vendor === "letscamp") {
      const client = letsCampClientFor(t.operator_id, t.operator_base_url);
      let campPromise = letsCampCampCache.get(t.vendor_park_id);
      if (!campPromise) {
        campPromise = client.getCamp(t.vendor_park_id);
        letsCampCampCache.set(t.vendor_park_id, campPromise);
      }
      const camp = await campPromise;
      const out: SiteNight[] = [];
      for (let night = startStr; night < endStr; night = addDays(night, 1)) {
        const cacheKey = `${t.operator_id}:${t.vendor_park_id}:${night}`;
        let promise = letsCampAvailabilityCache.get(cacheKey);
        if (!promise) {
          promise = client.searchAvailability({ camp, startDate: night });
          letsCampAvailabilityCache.set(cacheKey, promise);
        }
        const responses = await promise;
        out.push({
          site_id: t.site_id,
          night_date: night,
          status: letsCampStatusForSite(t.vendor_site_id, responses),
          last_checked_at: nowIso,
        });
      }
      return out;
    }

    if (t.operator_vendor === "camplife") {
      const client = camplifeClientFor(t.operator_id, t.operator_base_url);
      const out: SiteNight[] = [];
      for (let night = startStr; night < endStr; night = addDays(night, 1)) {
        const cacheKey = `${t.operator_id}:${t.vendor_park_id}:${night}`;
        let promise = camplifeAvailabilityCache.get(cacheKey);
        if (!promise) {
          promise = client.getAvailability({ campgroundId: t.vendor_park_id, startDate: night });
          camplifeAvailabilityCache.set(cacheKey, promise);
        }
        const response = await promise;
        out.push({
          site_id: t.site_id,
          night_date: night,
          status: decodeCamplifeStatus(t.vendor_site_id, response),
          last_checked_at: nowIso,
        });
      }
      return out;
    }

    const client = clientFor(t.operator_id, t.operator_base_url);
    const rows = await client.getResourceDailyAvailability({
      resourceLocationId: t.vendor_resource_location_id,
      resourceId: t.vendor_resource_id,
      bookingCategoryId: t.vendor_booking_category_id,
      equipmentCategoryId: t.equipment_category_id,
      subEquipmentCategoryId: t.sub_equipment_category_id,
      startDate: startStr,
      endDate: endStr,
    });
    const out: SiteNight[] = [];
    const cur = new Date(startStr + "T00:00:00Z");
    for (const row of rows) {
      out.push({
        site_id: t.site_id,
        night_date: cur.toISOString().slice(0, 10),
        status: decodeAvailability(row),
        last_checked_at: nowIso,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  }

  const errors: string[] = [];
  let sitesUpdated = 0;
  let nightsUpdated = 0;

  // Bounded-channel write buffer — drains in 500-row batches.
  const writeBuffer: SiteNight[] = [];
  let flushInFlight: Promise<void> | null = null;
  async function flush(force = false): Promise<void> {
    if (flushInFlight) await flushInFlight;
    if (writeBuffer.length < writeBatchSize && !force) return;
    flushInFlight = (async () => {
      while (writeBuffer.length >= writeBatchSize || (force && writeBuffer.length > 0)) {
        const batch = writeBuffer.splice(0, writeBatchSize);
        await upsertSiteAvailabilityBatch(batch);
      }
    })();
    try { await flushInFlight; } finally { flushInFlight = null; }
  }

  // Periodic progress logger
  const totalTargets = targets.length;
  let lastLogAt = 0;

  async function worker(workerId: number) {
    while (true) {
      const i = cursor++;
      if (i >= targets.length) return;
      const t = targets[i];
      try {
        const rows = await fetchTargetAvailability(t);
        let added = 0;
        for (const row of rows) {
          writeBuffer.push(row);
          added += 1;
        }
        sitesUpdated += 1;
        nightsUpdated += added;
        await flush();
      } catch (err) {
        errors.push(`site ${t.site_id}: ${(err as Error).message}`);
      }
      // Periodic progress (every ~250 sites)
      const now = Date.now();
      if (i > 0 && i % 250 === 0 && now - lastLogAt > 3000) {
        const elapsed = (now - started) / 1000;
        const rate = i / elapsed;
        const eta = (totalTargets - i) / rate;
        log(`[availability] ${i}/${totalTargets} sites (${rate.toFixed(1)} sites/s · ETA ${(eta / 60).toFixed(1)} min) · worker ${workerId}`);
        lastLogAt = now;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  await flush(true);

  // Prune nights that have fallen out of the window (yesterday or earlier).
  const pruned = await pruneStaleAvailability(today);
  if (pruned > 0) log(`[availability] pruned ${pruned} stale nights before ${today}`);

  // Refresh hot-path denormalized columns so the app sees the new data without
  // paying for analytics materialized-view refreshes on every frequent run.
  const refreshStart = Date.now();
  try {
    await refreshRollups();
    log(`[availability] refresh_rollups() done in ${((Date.now() - refreshStart) / 1000).toFixed(1)}s`);
    if (opts.refreshAnalytics) {
      const analyticsStart = Date.now();
      await refreshAggregates();
      log(`[availability] refresh_aggregates() done in ${((Date.now() - analyticsStart) / 1000).toFixed(1)}s`);
    }
  } catch (e) {
    errors.push(`post_refresh: ${(e as Error).message}`);
  }

  const duration_ms = Date.now() - started;
  const status: "success" | "partial" | "failed" =
    errors.length === 0 ? "success" : errors.length < targets.length ? "partial" : "failed";

  await finishRefreshLog({
    id: runId, status, sites_seen: totalTargets, sites_updated: sitesUpdated,
    nights_updated: nightsUpdated, duration_ms, errors,
  });
  if (status !== "failed") await setRefreshMeta("availability");

  log(
    `[availability] ${status}: ${sitesUpdated.toLocaleString()}/${totalTargets.toLocaleString()} sites, ` +
    `${nightsUpdated.toLocaleString()} nights, ${errors.length} errors, ${(duration_ms / 1000).toFixed(1)}s`,
  );

  return { sites_seen: totalTargets, sites_updated: sitesUpdated, nights_updated: nightsUpdated, errors, duration_ms };
}
