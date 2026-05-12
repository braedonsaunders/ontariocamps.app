/**
 * Search — Postgres-native version. Uses ST_DWithin for the radius filter
 * (PostGIS index does the heavy lifting) and SQL joins for the per-night
 * availability check.
 */

import { sql } from "./db/client";
import { PRESET_LOCATIONS } from "./locations";
import { buildBookingUrl } from "./booking-url";
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
  site_type_label: string | null;
  site_amenities: string[];
  site_rule_summary: unknown;
  campground_id: string;
  campground_name: string;
  matched_nights: (Date | string)[];
  last_checked_at: Date;
  distance_m: number | null;
};

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
        s.site_type_label,
        s.amenities AS site_amenities,
        s.rule_summary AS site_rule_summary,
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
      m.site_type_label,
      m.site_amenities,
      m.site_rule_summary,
      c.id AS campground_id,
      c.name AS campground_name,
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
    const ruleSummary = r.site_rule_summary && typeof r.site_rule_summary === "object"
      ? r.site_rule_summary as { highlights?: SearchResult["site"]["rule_highlights"] }
      : null;
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
        site_type_label: r.site_type_label,
        amenities,
        rule_highlights: Array.isArray(ruleSummary?.highlights) ? ruleSummary.highlights.slice(0, 4) : [],
      },
      campground: { id: r.campground_id, name: r.campground_name },
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
      booking_url: buildBookingUrl(r.vendor_url, {
        startDate: params.start_date,
        endDate: params.end_date,
      }),
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
  Array<{ operator: Operator; sites_indexed: number; available_sites: number; median_freshness_minutes: number }>
> {
  // Single SELECT off the denormalized operators row. Columns are kept fresh
  // by `refresh_aggregates()` which the availability ingest calls at its tail.
  const rows = await sql()<Array<{
    id: string; name: string; vendor: string; base_url: string; booking_url: string;
    active: boolean; total_sites: number; available_sites: number;
    last_availability_at: Date | string | null;
  }>>`
    SELECT id, name, vendor, base_url, booking_url, active,
           total_sites, available_sites, last_availability_at
      FROM operators ORDER BY name
  `;
  return rows.map((r) => {
    const last = r.last_availability_at;
    const lastMs = last ? (last instanceof Date ? last.getTime() : new Date(String(last)).getTime()) : 0;
    const minutes = lastMs ? Math.max(0, Math.floor((Date.now() - lastMs) / 60000)) : 0;
    return {
      operator: {
        id: r.id, name: r.name, vendor: r.vendor as Operator["vendor"],
        base_url: r.base_url, booking_url: r.booking_url, active: r.active,
      },
      sites_indexed: r.total_sites,
      available_sites: r.available_sites,
      median_freshness_minutes: minutes,
    };
  });
}
