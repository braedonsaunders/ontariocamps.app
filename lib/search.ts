/**
 * Search — Postgres-native version. Uses ST_DWithin for the radius filter
 * (PostGIS index does the heavy lifting) and SQL joins for the per-night
 * availability check.
 */

import { sql } from "./db/client";
import { PRESET_LOCATIONS } from "./locations";
import type { SearchResponse, SearchResult, SiteType, Operator } from "./types";
import { eachDate } from "./utils";

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
  park_id: string;
  park_slug: string;
  park_name: string;
  park_lat: number;
  park_lng: number;
  operator_id: string;
  operator_name: string;
  vendor_url: string;
  site_id: string;
  site_name: string;
  site_type: string;
  site_amenities: string[];
  matched_nights: (Date | string)[];
  last_checked_at: Date;
  distance_m: number | null;
};

function buildBookingUrl(parkVendorUrl: string, startDate?: string, endDate?: string): string {
  const sepCh = parkVendorUrl.includes("?") ? "&" : "?";
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  params.set("isReserving", "true");
  return `${parkVendorUrl}${sepCh}${params.toString()}`;
}

export async function runSearch(params: SearchParams): Promise<SearchResponse> {
  const client = sql();
  const wantDates = params.start_date && params.end_date
    ? eachDate(params.start_date, params.end_date)
    : null;
  const minNights = params.min_nights ?? (wantDates ? wantDates.length : 1);
  const flexible = params.flexible === true;
  const radiusM = (params.radius_km ?? Infinity) * 1000;
  const lat = params.lat;
  const lng = params.lng;
  const hasAnchor = lat != null && lng != null;

  // Postgres-js tagged template doesn't compose multiple WHERE fragments
  // gracefully — we build them with `client.unsafe` would defeat the purpose.
  // Instead we use parameterized SQL with optional CASE-like conditions.

  const rows = await client<SearchRow[]>`
    WITH matching AS (
      SELECT
        s.id  AS site_id,
        s.name AS site_name,
        s.site_type,
        s.amenities AS site_amenities,
        s.campground_id,
        array_agg(sa.night_date ORDER BY sa.night_date) AS matched_nights,
        max(sa.last_checked_at) AS last_checked_at
      FROM sites s
      JOIN site_availability sa ON sa.site_id = s.id
      WHERE sa.status = 'available'
        ${wantDates ? client`AND sa.night_date = ANY(${wantDates}::date[])` : client``}
        ${params.party_size && params.party_size > 0 ? client`AND s.max_party_size >= ${params.party_size}` : client``}
        ${params.site_types && params.site_types.length > 0 ? client`AND s.site_type = ANY(${params.site_types})` : client``}
      GROUP BY s.id
      HAVING count(sa.night_date) >= ${flexible ? 1 : minNights}
    )
    SELECT
      p.id   AS park_id,
      p.slug AS park_slug,
      p.name AS park_name,
      p.lat  AS park_lat,
      p.lng  AS park_lng,
      p.operator_id,
      o.name AS operator_name,
      p.vendor_url,
      m.site_id,
      m.site_name,
      m.site_type,
      m.site_amenities,
      m.matched_nights,
      m.last_checked_at,
      ${hasAnchor
        ? client`ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)`
        : client`NULL::float`}                                              AS distance_m
    FROM matching m
    JOIN sites s     ON s.id = m.site_id
    JOIN campgrounds c ON c.id = s.campground_id
    JOIN parks p     ON p.id = c.park_id
    JOIN operators o ON o.id = p.operator_id
    WHERE 1=1
      ${hasAnchor && radiusM !== Infinity ? client`AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM})` : client``}
      ${params.operators && params.operators.length > 0 ? client`AND p.operator_id = ANY(${params.operators})` : client``}
  `;

  const results: SearchResult[] = [];
  const freshnessSamples: number[] = [];

  for (const r of rows) {
    const amenities = Array.isArray(r.site_amenities) ? r.site_amenities : [];
    if (params.amenities && params.amenities.length > 0) {
      let ok = true;
      for (const code of params.amenities) {
        if (!amenities.includes(code)) { ok = false; break; }
      }
      if (!ok) continue;
    }

    const matchedNights = r.matched_nights.map((d) =>
      d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10),
    ).sort();

    if (wantDates && !flexible) {
      const set = new Set(matchedNights);
      let allPresent = true;
      for (const d of wantDates) {
        if (!set.has(d)) { allPresent = false; break; }
      }
      if (!allPresent) continue;
    }

    const lastChecked = r.last_checked_at instanceof Date ? r.last_checked_at.toISOString() : String(r.last_checked_at);
    freshnessSamples.push((Date.now() - new Date(lastChecked).getTime()) / 60000);

    const distance_km = r.distance_m != null ? r.distance_m / 1000 : undefined;

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
        last_checked_at: lastChecked,
      },
      booking_url: buildBookingUrl(r.vendor_url, params.start_date, params.end_date),
    });
  }

  const sortKey = params.sort ?? (hasAnchor ? "distance" : "freshness");
  results.sort((a, b) => {
    if (sortKey === "distance" && a.park.distance_km != null && b.park.distance_km != null) {
      return a.park.distance_km - b.park.distance_km;
    }
    if (sortKey === "freshness") {
      return new Date(b.availability.last_checked_at).getTime() - new Date(a.availability.last_checked_at).getTime();
    }
    if (sortKey === "name") return a.park.name.localeCompare(b.park.name);
    if (sortKey === "price") return (a.availability.price_cents ?? 0) - (b.availability.price_cents ?? 0);
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

export async function operatorHealth(): Promise<
  Array<{ operator: Operator; sites_indexed: number; median_freshness_minutes: number }>
> {
  const rows = await sql()<Array<{
    id: string; name: string; vendor: string; base_url: string; booking_url: string;
    active: boolean; sites_indexed: number; minutes_since_check: number;
  }>>`
    SELECT
      o.id, o.name, o.vendor, o.base_url, o.booking_url, o.active,
      count(distinct s.id)::int AS sites_indexed,
      COALESCE(
        EXTRACT(EPOCH FROM (now() - max(sa.last_checked_at))) / 60,
        0
      )::int AS minutes_since_check
    FROM operators o
    LEFT JOIN parks p             ON p.operator_id = o.id
    LEFT JOIN campgrounds c       ON c.park_id = p.id
    LEFT JOIN sites s             ON s.campground_id = c.id
    LEFT JOIN site_availability sa ON sa.site_id = s.id
    GROUP BY o.id
    ORDER BY o.name
  `;
  return rows.map((r) => ({
    operator: {
      id: r.id, name: r.name, vendor: r.vendor as Operator["vendor"],
      base_url: r.base_url, booking_url: r.booking_url, active: r.active,
    },
    sites_indexed: r.sites_indexed,
    median_freshness_minutes: r.minutes_since_check,
  }));
}
