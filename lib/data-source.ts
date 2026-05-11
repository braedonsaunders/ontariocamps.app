/**
 * Data-access façade over Supabase Postgres.
 *
 * Every function is async because Postgres-js is async. Server components and
 * route handlers `await` these directly. Pooled connections + Supabase's
 * regional pooler keep query latencies under ~50 ms for typical reads.
 *
 * Pattern: each call is one SQL query. We don't memoise here — Postgres is
 * fast and caching adds invalidation pain. Higher-level pages compose multiple
 * calls and pass derived data down as props.
 */

import { sql } from "./db/client";
import {
  getAllOperators,
  getAllParks,
  getAllCampgrounds,
  getAllCampMaps,
  getAllSites,
  getAllEquipmentOptions,
  getRefreshMeta,
  getLatestRefreshLogPerType,
  type RefreshLogRow,
} from "./db/queries";
import type { Operator, Park, Campground, Site, CampMap, EquipmentOption } from "./types";

// ─── Bulk reads (used by index pages, search, analytics) ────────────────────

export const fetchOperators = getAllOperators;
export const fetchParks = getAllParks;
export const fetchCampgrounds = getAllCampgrounds;
export const fetchSites = getAllSites;
export const fetchCampMaps = getAllCampMaps;
export const fetchEquipmentOptions = getAllEquipmentOptions;

// ─── Indexed views (computed on demand) ─────────────────────────────────────

export async function parksByOperator(): Promise<Map<string, Park[]>> {
  const m = new Map<string, Park[]>();
  for (const p of await fetchParks()) {
    if (!m.has(p.operator_id)) m.set(p.operator_id, []);
    m.get(p.operator_id)!.push(p);
  }
  return m;
}

export async function campgroundsByPark(): Promise<Map<string, Campground[]>> {
  const m = new Map<string, Campground[]>();
  for (const c of await fetchCampgrounds()) {
    if (!m.has(c.park_id)) m.set(c.park_id, []);
    m.get(c.park_id)!.push(c);
  }
  return m;
}

export async function sitesByCampground(): Promise<Map<string, Site[]>> {
  const m = new Map<string, Site[]>();
  for (const s of await fetchSites()) {
    if (!m.has(s.campground_id)) m.set(s.campground_id, []);
    m.get(s.campground_id)!.push(s);
  }
  return m;
}

export async function campMapsByPark(): Promise<Map<string, CampMap[]>> {
  const m = new Map<string, CampMap[]>();
  for (const cm of await fetchCampMaps()) {
    if (!m.has(cm.park_id)) m.set(cm.park_id, []);
    m.get(cm.park_id)!.push(cm);
  }
  return m;
}

export async function equipmentByOperator(): Promise<Map<string, EquipmentOption[]>> {
  const m = new Map<string, EquipmentOption[]>();
  for (const e of await fetchEquipmentOptions()) {
    if (!m.has(e.operator_id)) m.set(e.operator_id, []);
    m.get(e.operator_id)!.push(e);
  }
  return m;
}

export async function operatorById(): Promise<Map<string, Operator>> {
  return new Map((await fetchOperators()).map((o) => [o.id, o]));
}

export async function parkById(): Promise<Map<string, Park>> {
  return new Map((await fetchParks()).map((p) => [p.id, p]));
}

// ─── Single-record lookups (single SQL query each) ──────────────────────────

export async function getParkBySlug(slug: string): Promise<Park | null> {
  const rows = await sql()<Array<{
    id: string; operator_id: string; vendor_park_id: string; slug: string; name: string;
    description: string | null; region: string | null; lat: number; lng: number;
    address: string | null; hero_image_url: string | null; vendor_url: string;
  }>>`
    SELECT id, operator_id, vendor_park_id, slug, name, description, region,
           lat, lng, address, hero_image_url, vendor_url
      FROM parks WHERE slug = ${slug} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id, operator_id: r.operator_id, vendor_park_id: r.vendor_park_id,
    slug: r.slug, name: r.name,
    description: r.description ?? "", region: r.region ?? "",
    location: { lat: r.lat, lng: r.lng }, address: r.address ?? "",
    hero_image_url: r.hero_image_url ?? undefined, vendor_url: r.vendor_url,
  };
}

// ─── Freshness metadata ─────────────────────────────────────────────────────

export type DataSourceInfo = {
  hasReal: boolean;
  metadataLastRefreshedAt: string | null;
  availabilityLastRefreshedAt: string | null;
  refreshRuns: RefreshLogRow[];
};

export async function getDataSourceInfo(): Promise<DataSourceInfo> {
  try {
    const [meta, runs] = await Promise.all([getRefreshMeta(), getLatestRefreshLogPerType()]);
    const find = (t: string) => meta.find((m) => m.refresh_type === t)?.last_success_at ?? null;
    return {
      hasReal: meta.length > 0 || runs.length > 0,
      metadataLastRefreshedAt: find("metadata"),
      availabilityLastRefreshedAt: find("availability"),
      refreshRuns: runs,
    };
  } catch {
    return {
      hasReal: false,
      metadataLastRefreshedAt: null,
      availabilityLastRefreshedAt: null,
      refreshRuns: [],
    };
  }
}
