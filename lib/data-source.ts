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
  getSiteReviews,
  getSiteReviewAggregate,
  getParkReviews,
  getParkReviewAggregate,
  getRecentSiteReviewsForPark,
  getSiteReviewStatsForPark,
  type RefreshLogRow,
} from "./db/queries";
import type { Operator, Park, Campground, Site, CampMap, EquipmentOption, SiteReview, ParkReview, SiteReviewAggregate, ParkReviewAggregate } from "./types";

export {
  getSiteReviews,
  getSiteReviewAggregate,
  getParkReviews,
  getParkReviewAggregate,
  getRecentSiteReviewsForPark,
  getSiteReviewStatsForPark,
};
export type { SiteReview, ParkReview, SiteReviewAggregate, ParkReviewAggregate };

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

export type OperatorWithStats = {
  id: string; name: string; vendor: string;
  base_url: string; booking_url: string; active: boolean;
  total_parks: number; total_campgrounds: number; total_sites: number;
  available_sites: number;
  last_metadata_at: string | null;
  last_availability_at: string | null;
};

export async function getOperatorWithStats(id: string): Promise<OperatorWithStats | null> {
  const rows = await sql()<Array<{
    id: string; name: string; vendor: string;
    base_url: string; booking_url: string; active: boolean;
    total_parks: number; total_campgrounds: number; total_sites: number;
    available_sites: number;
    last_metadata_at: Date | string | null;
    last_availability_at: Date | string | null;
  }>>`
    SELECT id, name, vendor, base_url, booking_url, active,
           total_parks, total_campgrounds, total_sites, available_sites,
           last_metadata_at, last_availability_at
      FROM operators WHERE id = ${id}
      LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  const toStr = (d: Date | string | null) =>
    !d ? null : d instanceof Date ? d.toISOString() : String(d);
  return {
    ...r,
    last_metadata_at: toStr(r.last_metadata_at),
    last_availability_at: toStr(r.last_availability_at),
  };
}

export type ParkRow = {
  id: string; slug: string; name: string; region: string;
  operator_id: string; hero_image_url: string | null;
  total_sites: number; available_sites: number; availability_pct: number;
};

export async function getCampgroundsForPark(parkId: string): Promise<Campground[]> {
  return await sql()<Campground[]>`
    SELECT id, park_id, vendor_map_id, name FROM campgrounds WHERE park_id = ${parkId}
  `;
}

export async function getCampMapsForPark(parkId: string): Promise<CampMap[]> {
  const rows = await sql()<Array<{
    id: string; park_id: string; campground_id: string; vendor_map_id: string;
    name: string | null; description: string | null;
    image_url: string; x_dimension: number; y_dimension: number;
    features: unknown;
  }>>`
    SELECT id, park_id, campground_id, vendor_map_id, name, description,
           image_url, x_dimension, y_dimension, features
      FROM camp_maps WHERE park_id = ${parkId}
  `;
  return rows.map((r) => ({
    id: r.id, park_id: r.park_id, campground_id: r.campground_id,
    vendor_map_id: r.vendor_map_id, name: r.name, description: r.description,
    image_url: r.image_url, x_dimension: r.x_dimension, y_dimension: r.y_dimension,
    features: Array.isArray(r.features) ? (r.features as CampMap["features"]) : [],
  }));
}

export async function getSitesForPark(parkId: string): Promise<Site[]> {
  const rows = await sql()<Array<{
    id: string; campground_id: string; vendor_site_id: string; name: string;
    site_type: string; site_type_label: string | null; icon_type: number | null;
    max_party_size: number; max_equipment_length_ft: number | null;
    has_electric: boolean; has_water: boolean; has_sewer: boolean;
    is_pull_through: boolean; is_accessible: boolean;
    is_pet_friendly: boolean; is_waterfront: boolean;
    amenities: string[];
    camp_map_id: string | null; map_x: number | null; map_y: number | null;
    photos: unknown; description: string | null;
  }>>`
    SELECT s.id, s.campground_id, s.vendor_site_id, s.name, s.site_type,
           s.site_type_label, s.icon_type,
           s.max_party_size, s.max_equipment_length_ft,
           s.has_electric, s.has_water, s.has_sewer, s.is_pull_through,
           s.is_accessible, s.is_pet_friendly, s.is_waterfront,
           s.amenities, s.camp_map_id, s.map_x, s.map_y,
           s.photos, s.description
      FROM sites s
      JOIN campgrounds c ON c.id = s.campground_id
     WHERE c.park_id = ${parkId}
  `;
  return rows.map((r) => ({
    id: r.id, campground_id: r.campground_id, vendor_site_id: r.vendor_site_id,
    name: r.name, site_type: r.site_type as Site["site_type"],
    site_type_label: r.site_type_label, icon_type: r.icon_type,
    max_party_size: r.max_party_size, max_equipment_length_ft: r.max_equipment_length_ft,
    has_electric: r.has_electric, has_water: r.has_water, has_sewer: r.has_sewer,
    is_pull_through: r.is_pull_through, is_accessible: r.is_accessible,
    is_pet_friendly: r.is_pet_friendly, is_waterfront: r.is_waterfront,
    amenities: Array.isArray(r.amenities) ? r.amenities : [],
    camp_map_id: r.camp_map_id, map_x: r.map_x, map_y: r.map_y,
    photos: Array.isArray(r.photos) ? (r.photos as Site["photos"]) : [],
    description: r.description,
  }));
}

export async function getSiteByPark(
  parkId: string,
  vendorSiteId: string,
): Promise<Site | null> {
  const rows = await sql()<Array<{
    id: string; campground_id: string; vendor_site_id: string; name: string;
    site_type: string; site_type_label: string | null; icon_type: number | null;
    max_party_size: number; max_equipment_length_ft: number | null;
    has_electric: boolean; has_water: boolean; has_sewer: boolean;
    is_pull_through: boolean; is_accessible: boolean;
    is_pet_friendly: boolean; is_waterfront: boolean;
    amenities: string[];
    camp_map_id: string | null; map_x: number | null; map_y: number | null;
    photos: unknown; description: string | null;
  }>>`
    SELECT s.id, s.campground_id, s.vendor_site_id, s.name, s.site_type,
           s.site_type_label, s.icon_type,
           s.max_party_size, s.max_equipment_length_ft,
           s.has_electric, s.has_water, s.has_sewer, s.is_pull_through,
           s.is_accessible, s.is_pet_friendly, s.is_waterfront,
           s.amenities, s.camp_map_id, s.map_x, s.map_y,
           s.photos, s.description
      FROM sites s
      JOIN campgrounds c ON c.id = s.campground_id
     WHERE c.park_id = ${parkId}
       AND s.vendor_site_id = ${vendorSiteId}
     LIMIT 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id, campground_id: r.campground_id, vendor_site_id: r.vendor_site_id,
    name: r.name, site_type: r.site_type as Site["site_type"],
    site_type_label: r.site_type_label, icon_type: r.icon_type,
    max_party_size: r.max_party_size, max_equipment_length_ft: r.max_equipment_length_ft,
    has_electric: r.has_electric, has_water: r.has_water, has_sewer: r.has_sewer,
    is_pull_through: r.is_pull_through, is_accessible: r.is_accessible,
    is_pet_friendly: r.is_pet_friendly, is_waterfront: r.is_waterfront,
    amenities: Array.isArray(r.amenities) ? r.amenities : [],
    camp_map_id: r.camp_map_id, map_x: r.map_x, map_y: r.map_y,
    photos: Array.isArray(r.photos) ? (r.photos as Site["photos"]) : [],
    description: r.description,
  };
}

export async function getSiteAvailability(siteId: string): Promise<Array<{ night_date: string; status: string; last_checked_at: string }>> {
  const rows = await sql()<Array<{
    night_date: Date | string;
    status: string;
    last_checked_at: Date | string;
  }>>`
    SELECT night_date, status, last_checked_at
      FROM site_availability
     WHERE site_id = ${siteId}
     ORDER BY night_date
  `;
  return rows.map((r) => ({
    night_date: r.night_date instanceof Date ? r.night_date.toISOString().slice(0, 10) : String(r.night_date).slice(0, 10),
    status: r.status,
    last_checked_at: r.last_checked_at instanceof Date ? r.last_checked_at.toISOString() : String(r.last_checked_at),
  }));
}

export async function getEquipmentForOperator(operatorId: string): Promise<EquipmentOption[]> {
  return await sql()<EquipmentOption[]>`
    SELECT operator_id, equipment_category_id, sub_equipment_category_id, name, order_index
      FROM equipment_categories
     WHERE operator_id = ${operatorId}
     ORDER BY order_index, name
  `;
}

/** Slim per-operator park list — read straight from the denormalized parks table. */
export async function getParksForOperator(operatorId: string): Promise<ParkRow[]> {
  return await sql()<ParkRow[]>`
    SELECT id, slug, name, region, operator_id, hero_image_url,
           total_sites, available_sites, availability_pct
      FROM parks
     WHERE operator_id = ${operatorId}
     ORDER BY name
  `;
}

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
