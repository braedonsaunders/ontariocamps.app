/**
 * Availability ingest — per-night status for every site, fetched in parallel.
 *
 * Reads vendor IDs from the `sites` table (populated by metadata ingest), so
 * no map-tree walking required — we go straight from "list of sites" to
 * "per-resource daily availability calls" with bounded concurrency.
 *
 * Target cadence: hourly during the day, every 15 min during high traffic.
 * Target runtime: under 20 min for the full 24k-site index at 8-way concurrency.
 *
 * Writes are batched UPSERTs into `site_availability` (PRIMARY KEY (site_id,
 * night_date)) so a partial run preserves prior nightly data and an interrupted
 * run is safe to resume.
 */

import { CamisClient } from "./camis-client";
import {
  upsertSiteAvailabilityBatch,
  startRefreshLog,
  finishRefreshLog,
  setRefreshMeta,
  pruneStaleAvailability,
  type SiteNight,
} from "../db/queries";
import { db } from "../db/client";

type AvailabilityCode = "available" | "reserved" | "closed" | "unknown";
function decodeAvailability(code: number): AvailabilityCode {
  if (code === 0) return "available";
  if (code === 3 || code === 5) return "closed";
  return "reserved";
}

type FetchTarget = {
  site_id: string;
  vendor_resource_location_id: number;
  vendor_resource_id: number;
  vendor_booking_category_id: number;
  operator_id: string;
  operator_base_url: string;
  equipment_category_id: number;
  sub_equipment_category_id: number;
};

/**
 * Build the work queue: every site we know about, joined with its operator's
 * fetch config. Returns one record per site.
 */
function loadFetchTargets(): FetchTarget[] {
  return db()
    .prepare(
      `SELECT s.id              AS site_id,
              s.vendor_resource_location_id,
              s.vendor_resource_id,
              s.vendor_booking_category_id,
              o.id              AS operator_id,
              o.base_url        AS operator_base_url,
              ofc.equipment_category_id,
              ofc.sub_equipment_category_id
         FROM sites s
         JOIN campgrounds c           ON c.id = s.campground_id
         JOIN parks p                 ON p.id = c.park_id
         JOIN operators o             ON o.id = p.operator_id
         JOIN operator_fetch_config ofc ON ofc.operator_id = o.id
        WHERE s.vendor_resource_location_id IS NOT NULL
          AND s.vendor_resource_id IS NOT NULL`,
    )
    .all() as FetchTarget[];
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
  /** Days from today to skip (typical "hold-back" before booking opens). */
  daysSkip?: number;
  /** Maximum sites to fetch (for testing). */
  maxSites?: number;
  /** Optional filter — only fetch sites for these operator IDs. */
  operatorIds?: string[];
  /** Batch size for SQLite UPSERTs. */
  writeBatchSize?: number;
};

export async function refreshAvailability(
  opts: AvailabilityRefreshOptions = {},
  log: (m: string) => void = () => {},
): Promise<{ sites_seen: number; sites_updated: number; nights_updated: number; errors: string[]; duration_ms: number; }> {
  const concurrency = opts.concurrency ?? 8;
  const requestDelayMs = opts.requestDelayMs ?? 250;
  const daysAhead = opts.daysAhead ?? 90;
  const daysSkip = opts.daysSkip ?? 14;
  const writeBatchSize = opts.writeBatchSize ?? 500;

  const started = Date.now();
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() + daysSkip);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + daysAhead);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  let targets = loadFetchTargets();
  if (opts.operatorIds && opts.operatorIds.length) {
    const allowed = new Set(opts.operatorIds);
    targets = targets.filter((t) => allowed.has(t.operator_id));
  }
  if (opts.maxSites != null) targets = targets.slice(0, opts.maxSites);

  log(`[availability] ${targets.length} sites · window ${startStr} → ${endStr} · ${concurrency} workers`);
  if (targets.length === 0) {
    return { sites_seen: 0, sites_updated: 0, nights_updated: 0, errors: [], duration_ms: Date.now() - started };
  }

  const runId = startRefreshLog("availability", opts.operatorIds?.join(",") ?? null);

  // Shared work queue + per-operator client cache. Each operator gets its own
  // CamisClient so the politeWait() between requests is per-host (Camis's WAF
  // sees one logical client per hostname).
  let cursor = 0;
  const clients = new Map<string, CamisClient>();
  function clientFor(operator_id: string, base_url: string): CamisClient {
    const c = clients.get(operator_id);
    if (c) return c;
    const fresh = new CamisClient({ baseUrl: base_url, requestDelayMs });
    clients.set(operator_id, fresh);
    return fresh;
  }

  const errors: string[] = [];
  let sitesUpdated = 0;
  let nightsUpdated = 0;

  // Bounded-channel write buffer — drains in 500-row batches.
  const writeBuffer: SiteNight[] = [];
  function flush(force = false) {
    while (writeBuffer.length >= writeBatchSize || (force && writeBuffer.length > 0)) {
      const batch = writeBuffer.splice(0, writeBatchSize);
      upsertSiteAvailabilityBatch(batch);
    }
  }

  // Periodic progress logger
  const totalTargets = targets.length;
  let lastLogAt = 0;

  async function worker(workerId: number) {
    while (true) {
      const i = cursor++;
      if (i >= targets.length) return;
      const t = targets[i];
      const client = clientFor(t.operator_id, t.operator_base_url);
      try {
        const rows = await client.getResourceDailyAvailability({
          resourceLocationId: t.vendor_resource_location_id,
          resourceId: t.vendor_resource_id,
          bookingCategoryId: t.vendor_booking_category_id,
          equipmentCategoryId: t.equipment_category_id,
          subEquipmentCategoryId: t.sub_equipment_category_id,
          startDate: startStr,
          endDate: endStr,
        });
        const nowIso = new Date().toISOString();
        const cur = new Date(startStr + "T00:00:00Z");
        let added = 0;
        for (const row of rows) {
          const night = cur.toISOString().slice(0, 10);
          writeBuffer.push({
            site_id: t.site_id,
            night_date: night,
            status: decodeAvailability(row.availability),
            last_checked_at: nowIso,
          });
          added += 1;
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
        sitesUpdated += 1;
        nightsUpdated += added;
        flush();
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
  flush(true);

  // Prune nights that have fallen out of the window (yesterday or earlier).
  const today = new Date().toISOString().slice(0, 10);
  const pruned = pruneStaleAvailability(today);
  if (pruned > 0) log(`[availability] pruned ${pruned} stale nights before ${today}`);

  const duration_ms = Date.now() - started;
  const status: "success" | "partial" | "failed" =
    errors.length === 0 ? "success" : errors.length < targets.length ? "partial" : "failed";

  finishRefreshLog({
    id: runId, status, sites_seen: totalTargets, sites_updated: sitesUpdated,
    nights_updated: nightsUpdated, duration_ms, errors,
  });
  if (status !== "failed") setRefreshMeta("availability");

  log(
    `[availability] ${status}: ${sitesUpdated.toLocaleString()}/${totalTargets.toLocaleString()} sites, ` +
    `${nightsUpdated.toLocaleString()} nights, ${errors.length} errors, ${(duration_ms / 1000).toFixed(1)}s`,
  );

  return { sites_seen: totalTargets, sites_updated: sitesUpdated, nights_updated: nightsUpdated, errors, duration_ms };
}
