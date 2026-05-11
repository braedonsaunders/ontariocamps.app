/**
 * Search — joins parks + sites + site_availability via SQL so the result
 * reflects real per-night availability (not a window summary).
 *
 * Geo filter is done in app code with Haversine. Production Postgres replaces
 * this with `ST_DWithin(location, ST_MakePoint($1,$2)::geography, $3 * 1000)`.
 */

import { db } from "./db/client";
import { operatorById, parkById } from "./data-source";
import { PRESET_LOCATIONS } from "./locations";
import type { SearchResponse, SearchResult, SiteType } from "./types";
import { eachDate, haversineKm } from "./utils";

export { PRESET_LOCATIONS };

export type SearchParams = {
  lat?: number;
  lng?: number;
  radius_km?: number;
  start_date?: string;
  end_date?: string;
  min_nights?: number;
  flexible?: boolean;
  party_size?: number;
  site_types?: string[];
  amenities?: string[];
  operators?: string[];
  equipment_length_ft?: number;
  limit?: number;
  offset?: number;
  sort?: "distance" | "freshness" | "name" | "price";
};

const DEFAULT_LIMIT = 30;

type SearchRow = {
  // park / operator
  park_id: string;
  park_slug: string;
  park_name: string;
  park_lat: number;
  park_lng: number;
  operator_id: string;
  operator_name: string;
  vendor_url: string;
  // site
  site_id: string;
  site_name: string;
  site_type: string;
  site_amenities: string;
  // availability — comma-joined arrays for the requested window
  matched_nights: string;
  last_checked_at: string;
};

function buildBookingUrl(operatorId: string, parkId: string, startDate?: string, endDate?: string): string {
  const operator = operatorById.get(operatorId);
  if (!operator) return "#";
  const park = parkById.get(parkId);
  if (!park) return operator.base_url;
  const sep = park.vendor_url.includes("?") ? "&" : "?";
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  params.set("isReserving", "true");
  return `${park.vendor_url}${sep}${params.toString()}`;
}

export function runSearch(params: SearchParams): SearchResponse {
  const wantDates = params.start_date && params.end_date
    ? eachDate(params.start_date, params.end_date)
    : null;
  const operatorFilter = params.operators && params.operators.length > 0 ? new Set(params.operators) : null;
  const siteTypeFilter = params.site_types && params.site_types.length > 0 ? new Set(params.site_types) : null;
  const anchor = params.lat != null && params.lng != null ? { lat: params.lat, lng: params.lng } : null;
  const radius = params.radius_km ?? Infinity;
  const minNights = params.min_nights ?? (wantDates ? wantDates.length : 1);
  const flexible = params.flexible === true;

  // SQL: one row per (site, matching night). We aggregate in app code.
  // Strategy:
  //   - JOIN sites + availability filtering on status='available'
  //   - Optionally filter night_date to the requested window
  //   - GROUP BY site to get the count + list of matching nights
  //   - Apply party_size / site_type filters as SQL too
  let nightClause = "";
  const sqlParams: (string | number)[] = [];
  if (wantDates) {
    const placeholders = wantDates.map(() => "?").join(",");
    nightClause = `AND sa.night_date IN (${placeholders})`;
    sqlParams.push(...wantDates);
  }

  let operatorClause = "";
  if (operatorFilter) {
    const placeholders = Array.from(operatorFilter).map(() => "?").join(",");
    operatorClause = `AND p.operator_id IN (${placeholders})`;
    sqlParams.push(...operatorFilter);
  }

  let typeClause = "";
  if (siteTypeFilter) {
    const placeholders = Array.from(siteTypeFilter).map(() => "?").join(",");
    typeClause = `AND s.site_type IN (${placeholders})`;
    sqlParams.push(...siteTypeFilter);
  }

  let partyClause = "";
  if (params.party_size && params.party_size > 0) {
    partyClause = `AND s.max_party_size >= ?`;
    sqlParams.push(params.party_size);
  }

  const sql = `
    SELECT
      p.id          AS park_id,
      p.slug        AS park_slug,
      p.name        AS park_name,
      p.lat         AS park_lat,
      p.lng         AS park_lng,
      p.operator_id AS operator_id,
      o.name        AS operator_name,
      p.vendor_url  AS vendor_url,
      s.id          AS site_id,
      s.name        AS site_name,
      s.site_type   AS site_type,
      s.amenities   AS site_amenities,
      GROUP_CONCAT(sa.night_date, ',') AS matched_nights,
      max(sa.last_checked_at) AS last_checked_at
    FROM sites s
    JOIN campgrounds c     ON c.id = s.campground_id
    JOIN parks p           ON p.id = c.park_id
    JOIN operators o       ON o.id = p.operator_id
    JOIN site_availability sa ON sa.site_id = s.id
    WHERE sa.status = 'available'
      ${nightClause}
      ${operatorClause}
      ${typeClause}
      ${partyClause}
    GROUP BY s.id
    HAVING count(sa.night_date) >= ?
  `;
  sqlParams.push(flexible ? 1 : minNights);

  const rows = db().prepare(sql).all(...sqlParams) as SearchRow[];

  // App-side: distance filter, amenity filter (amenities are a JSON array),
  // build final SearchResult.
  const results: SearchResult[] = [];
  const freshnessSamples: number[] = [];
  for (const r of rows) {
    const distance_km = anchor
      ? haversineKm(anchor, { lat: r.park_lat, lng: r.park_lng })
      : undefined;
    if (distance_km != null && distance_km > radius) continue;

    const amenities = JSON.parse(r.site_amenities) as string[];
    if (params.amenities && params.amenities.length > 0) {
      let ok = true;
      for (const code of params.amenities) {
        if (!amenities.includes(code)) { ok = false; break; }
      }
      if (!ok) continue;
    }

    const matchedNights = r.matched_nights ? r.matched_nights.split(",").sort() : [];
    // For non-flexible queries with a date window, require all wantDates to be present
    if (wantDates && !flexible) {
      const set = new Set(matchedNights);
      let allPresent = true;
      for (const d of wantDates) {
        if (!set.has(d)) { allPresent = false; break; }
      }
      if (!allPresent) continue;
    }

    freshnessSamples.push((Date.now() - new Date(r.last_checked_at).getTime()) / 60000);

    results.push({
      site: {
        id: r.site_id,
        name: r.site_name,
        site_type: r.site_type as SiteType,
        amenities,
      },
      campground: { id: "", name: "" },
      park: {
        slug: r.park_slug,
        name: r.park_name,
        operator: r.operator_name,
        operator_id: r.operator_id,
        location: { lat: r.park_lat, lng: r.park_lng },
        distance_km,
      },
      availability: {
        nights: wantDates && !flexible ? wantDates : matchedNights.slice(0, 7),
        price_cents: null,
        last_checked_at: r.last_checked_at,
      },
      booking_url: buildBookingUrl(r.operator_id, r.park_id, params.start_date, params.end_date),
    });
  }

  const sort = params.sort ?? (anchor ? "distance" : "freshness");
  results.sort((a, b) => {
    if (sort === "distance" && a.park.distance_km != null && b.park.distance_km != null) {
      return a.park.distance_km - b.park.distance_km;
    }
    if (sort === "freshness") {
      return new Date(b.availability.last_checked_at).getTime() - new Date(a.availability.last_checked_at).getTime();
    }
    if (sort === "name") return a.park.name.localeCompare(b.park.name);
    if (sort === "price") return (a.availability.price_cents ?? 0) - (b.availability.price_cents ?? 0);
    return 0;
  });

  freshnessSamples.sort((a, b) => a - b);
  const p50 = freshnessSamples.length ? freshnessSamples[Math.floor(freshnessSamples.length / 2)] : 0;

  const offset = params.offset ?? 0;
  const limit = params.limit ?? DEFAULT_LIMIT;
  return {
    results: results.slice(offset, offset + limit),
    total: results.length,
    freshness_p50_minutes: Math.round(p50),
  };
}

/** Per-operator freshness rollup for the data-freshness UI. */
export function operatorHealth() {
  const rows = db()
    .prepare(
      `SELECT
         o.id, o.name, o.vendor, o.base_url, o.booking_url, o.active,
         count(distinct s.id) AS sites_indexed,
         coalesce(
           cast((julianday('now') - julianday(max(sa.last_checked_at))) * 24 * 60 AS INTEGER),
           0
         ) AS minutes_since_check
       FROM operators o
       LEFT JOIN parks p             ON p.operator_id = o.id
       LEFT JOIN campgrounds c       ON c.park_id = p.id
       LEFT JOIN sites s             ON s.campground_id = c.id
       LEFT JOIN site_availability sa ON sa.site_id = s.id
       GROUP BY o.id
       ORDER BY o.name`,
    )
    .all() as Array<{
      id: string; name: string; vendor: string; base_url: string; booking_url: string;
      active: number; sites_indexed: number; minutes_since_check: number;
    }>;
  return rows.map((r) => ({
    operator: {
      id: r.id, name: r.name, vendor: r.vendor as "camis5" | "goingtocamp" | "pcrs",
      base_url: r.base_url, booking_url: r.booking_url, active: r.active === 1,
    },
    sites_indexed: r.sites_indexed,
    median_freshness_minutes: r.minutes_since_check,
  }));
}
