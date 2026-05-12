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
  getSiteReviews,
  getSiteReviewAggregate,
  getParkReviews,
  getParkReviewAggregate,
  getRecentSiteReviewsForPark,
  getSiteReviewStatsForPark,
  getOperatorRuleSource,
} from "./db/queries";
import type { Operator, Park, Campground, Site, CampMap, EquipmentOption, SiteReview, ParkReview, SiteReviewAggregate, ParkReviewAggregate } from "./types";

export {
  getSiteReviews,
  getSiteReviewAggregate,
  getParkReviews,
  getParkReviewAggregate,
  getRecentSiteReviewsForPark,
  getSiteReviewStatsForPark,
  getOperatorRuleSource,
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
    min_party_size: number | null; max_party_size: number; max_stay_nights: number | null;
    max_equipment_length_ft: number | null;
    has_electric: boolean; has_water: boolean; has_sewer: boolean;
    is_pull_through: boolean; is_accessible: boolean;
    is_pet_friendly: boolean; is_waterfront: boolean;
    amenities: string[];
    camp_map_id: string | null; map_x: number | null; map_y: number | null;
    photos: unknown; description: string | null;
    defined_attributes: unknown; allowed_equipment: unknown; rule_summary: unknown;
  }>>`
    SELECT s.id, s.campground_id, s.vendor_site_id, s.name, s.site_type,
           s.site_type_label, s.icon_type,
           s.min_party_size, s.max_party_size, s.max_stay_nights, s.max_equipment_length_ft,
           s.has_electric, s.has_water, s.has_sewer, s.is_pull_through,
           s.is_accessible, s.is_pet_friendly, s.is_waterfront,
           s.amenities, s.camp_map_id, s.map_x, s.map_y,
           s.photos, s.description, s.defined_attributes, s.allowed_equipment, s.rule_summary
      FROM sites s
      JOIN campgrounds c ON c.id = s.campground_id
     WHERE c.park_id = ${parkId}
  `;
  return rows.map((r) => ({
    id: r.id, campground_id: r.campground_id, vendor_site_id: r.vendor_site_id,
    name: r.name, site_type: r.site_type as Site["site_type"],
    site_type_label: r.site_type_label, icon_type: r.icon_type,
    min_party_size: r.min_party_size, max_party_size: r.max_party_size,
    max_stay_nights: r.max_stay_nights, max_equipment_length_ft: r.max_equipment_length_ft,
    has_electric: r.has_electric, has_water: r.has_water, has_sewer: r.has_sewer,
    is_pull_through: r.is_pull_through, is_accessible: r.is_accessible,
    is_pet_friendly: r.is_pet_friendly, is_waterfront: r.is_waterfront,
    amenities: Array.isArray(r.amenities) ? r.amenities : [],
    camp_map_id: r.camp_map_id, map_x: r.map_x, map_y: r.map_y,
    photos: Array.isArray(r.photos) ? (r.photos as Site["photos"]) : [],
    description: r.description,
    defined_attributes: Array.isArray(r.defined_attributes) ? (r.defined_attributes as Site["defined_attributes"]) : [],
    allowed_equipment: Array.isArray(r.allowed_equipment) ? (r.allowed_equipment as Site["allowed_equipment"]) : [],
    rule_summary: r.rule_summary && typeof r.rule_summary === "object" ? (r.rule_summary as Site["rule_summary"]) : null,
  }));
}

export async function getSiteByPark(
  parkId: string,
  vendorSiteId: string,
): Promise<Site | null> {
  const rows = await sql()<Array<{
    id: string; campground_id: string; vendor_site_id: string; name: string;
    site_type: string; site_type_label: string | null; icon_type: number | null;
    min_party_size: number | null; max_party_size: number; max_stay_nights: number | null;
    max_equipment_length_ft: number | null;
    has_electric: boolean; has_water: boolean; has_sewer: boolean;
    is_pull_through: boolean; is_accessible: boolean;
    is_pet_friendly: boolean; is_waterfront: boolean;
    amenities: string[];
    camp_map_id: string | null; map_x: number | null; map_y: number | null;
    photos: unknown; description: string | null;
    defined_attributes: unknown; allowed_equipment: unknown; rule_summary: unknown;
  }>>`
    SELECT s.id, s.campground_id, s.vendor_site_id, s.name, s.site_type,
           s.site_type_label, s.icon_type,
           s.min_party_size, s.max_party_size, s.max_stay_nights, s.max_equipment_length_ft,
           s.has_electric, s.has_water, s.has_sewer, s.is_pull_through,
           s.is_accessible, s.is_pet_friendly, s.is_waterfront,
           s.amenities, s.camp_map_id, s.map_x, s.map_y,
           s.photos, s.description, s.defined_attributes, s.allowed_equipment, s.rule_summary
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
    min_party_size: r.min_party_size, max_party_size: r.max_party_size,
    max_stay_nights: r.max_stay_nights, max_equipment_length_ft: r.max_equipment_length_ft,
    has_electric: r.has_electric, has_water: r.has_water, has_sewer: r.has_sewer,
    is_pull_through: r.is_pull_through, is_accessible: r.is_accessible,
    is_pet_friendly: r.is_pet_friendly, is_waterfront: r.is_waterfront,
    amenities: Array.isArray(r.amenities) ? r.amenities : [],
    camp_map_id: r.camp_map_id, map_x: r.map_x, map_y: r.map_y,
    photos: Array.isArray(r.photos) ? (r.photos as Site["photos"]) : [],
    description: r.description,
    defined_attributes: Array.isArray(r.defined_attributes) ? (r.defined_attributes as Site["defined_attributes"]) : [],
    allowed_equipment: Array.isArray(r.allowed_equipment) ? (r.allowed_equipment as Site["allowed_equipment"]) : [],
    rule_summary: r.rule_summary && typeof r.rule_summary === "object" ? (r.rule_summary as Site["rule_summary"]) : null,
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
    SELECT id, operator_id, vendor_park_id, slug, name,
           COALESCE(ai_long_description, ai_description, description) AS description,
           region,
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
};

export async function getDataSourceInfo(): Promise<DataSourceInfo> {
  try {
    const meta = await getRefreshMeta();
    const find = (t: string) => meta.find((m) => m.refresh_type === t)?.last_success_at ?? null;
    return {
      hasReal: meta.length > 0,
      metadataLastRefreshedAt: find("metadata"),
      availabilityLastRefreshedAt: find("availability"),
    };
  } catch {
    return {
      hasReal: false,
      metadataLastRefreshedAt: null,
      availabilityLastRefreshedAt: null,
    };
  }
}

export type AvailabilityWorkerSummary = {
  latestRunId: number | null;
  latestScope: string | null;
  latestStatus: string | null;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
  latestStartedMinutesAgo: number | null;
  latestSitesUpdated: number;
  latestNightsUpdated: number;
  latestDurationMs: number | null;
  runsLastHour: number;
  successesLastHour: number;
  partialsLastHour: number;
  failuresLastHour: number;
  sitesUpdatedLastHour: number;
  nightsUpdatedLastHour: number;
  averageDurationMsLastHour: number | null;
};

export type AvailabilityFreshnessSummary = {
  totalSites: number;
  checkedToday: number;
  availableToday: number;
  checkedLastHour: number;
  checkedLastTwoHours: number;
  checkedLastSixHours: number;
  checkedLastTwelveHours: number;
  currentP50Minutes: number | null;
  currentP90Minutes: number | null;
  availableP50Minutes: number | null;
  availableP90Minutes: number | null;
  hotP50Minutes: number | null;
  hotP90Minutes: number | null;
  hotDueSites: number;
  nearDueSites: number;
  planningDueSites: number;
  deepDueSites: number;
};

export type AvailabilityScopeSummary = {
  scope: string;
  runs: number;
  sitesUpdated: number;
  nightsUpdated: number;
  latestStartedAt: string | null;
  averageDurationMs: number | null;
};

export type AvailabilityOperatorHealth = {
  operator: Pick<Operator, "id" | "name" | "vendor">;
  sitesIndexed: number;
  availableToday: number;
  checkedLastTwoHours: number;
  checkedLastSixHours: number;
  currentP50Minutes: number | null;
  currentP90Minutes: number | null;
  availableP50Minutes: number | null;
  hotP50Minutes: number | null;
  hotDueSites: number;
  latestCheckedAt: string | null;
  latestCheckedMinutesAgo: number | null;
  status: "active" | "warming" | "queued" | "steady";
};

export type AvailabilityHealth = {
  worker: AvailabilityWorkerSummary;
  freshness: AvailabilityFreshnessSummary;
  scopes: AvailabilityScopeSummary[];
  operators: AvailabilityOperatorHealth[];
};

type MaybeDate = Date | string | null;

function toIso(value: MaybeDate): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function toNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNumber(value: unknown): number {
  return toNullableNumber(value) ?? 0;
}

function operatorStatus(row: {
  checked_last_two_hours: number;
  checked_last_six_hours: number;
  hot_due_sites: number;
  latest_checked_minutes_ago: number | null;
}): AvailabilityOperatorHealth["status"] {
  if (row.checked_last_two_hours > 0 || (row.latest_checked_minutes_ago ?? Infinity) <= 120) return "active";
  if (row.checked_last_six_hours > 0 || (row.latest_checked_minutes_ago ?? Infinity) <= 360) return "warming";
  if (row.hot_due_sites > 0) return "queued";
  return "steady";
}

export async function getAvailabilityHealth(): Promise<AvailabilityHealth> {
  const [freshnessRows, latestRows, recentRows, scopeRows, operatorRows] = await Promise.all([
    sql()<Array<{
      total_sites: number;
      checked_today: number;
      available_today: number;
      checked_last_hour: number;
      checked_last_two_hours: number;
      checked_last_six_hours: number;
      checked_last_twelve_hours: number;
      current_p50_minutes: number | null;
      current_p90_minutes: number | null;
      available_p50_minutes: number | null;
      available_p90_minutes: number | null;
      hot_p50_minutes: number | null;
      hot_p90_minutes: number | null;
      hot_due_sites: number;
      near_due_sites: number;
      planning_due_sites: number;
      deep_due_sites: number;
    }>>`
      WITH per_site AS (
        SELECT s.id,
               today.status AS today_status,
               today.last_checked_at AS today_last_checked_at,
               ars.hot_last_checked_at,
               ars.hot_due_at,
               ars.near_due_at,
               ars.planning_due_at,
               ars.deep_due_at
          FROM sites s
          LEFT JOIN site_availability today
                 ON today.site_id = s.id
                AND today.night_date = CURRENT_DATE
          LEFT JOIN availability_refresh_state ars ON ars.site_id = s.id
      )
      SELECT count(*)::int AS total_sites,
             count(today_last_checked_at)::int AS checked_today,
             count(*) FILTER (WHERE today_status = 'available')::int AS available_today,
             count(*) FILTER (WHERE today_last_checked_at > now() - interval '1 hour')::int AS checked_last_hour,
             count(*) FILTER (WHERE today_last_checked_at > now() - interval '2 hours')::int AS checked_last_two_hours,
             count(*) FILTER (WHERE today_last_checked_at > now() - interval '6 hours')::int AS checked_last_six_hours,
             count(*) FILTER (WHERE today_last_checked_at > now() - interval '12 hours')::int AS checked_last_twelve_hours,
             round((
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - today_last_checked_at)) / 60
               ) FILTER (WHERE today_last_checked_at IS NOT NULL)
             )::numeric)::int AS current_p50_minutes,
             round((
               percentile_cont(0.9) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - today_last_checked_at)) / 60
               ) FILTER (WHERE today_last_checked_at IS NOT NULL)
             )::numeric)::int AS current_p90_minutes,
             round((
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - today_last_checked_at)) / 60
               ) FILTER (WHERE today_status = 'available' AND today_last_checked_at IS NOT NULL)
             )::numeric)::int AS available_p50_minutes,
             round((
               percentile_cont(0.9) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - today_last_checked_at)) / 60
               ) FILTER (WHERE today_status = 'available' AND today_last_checked_at IS NOT NULL)
             )::numeric)::int AS available_p90_minutes,
             round((
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - hot_last_checked_at)) / 60
               ) FILTER (WHERE hot_last_checked_at IS NOT NULL)
             )::numeric)::int AS hot_p50_minutes,
             round((
               percentile_cont(0.9) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - hot_last_checked_at)) / 60
               ) FILTER (WHERE hot_last_checked_at IS NOT NULL)
             )::numeric)::int AS hot_p90_minutes,
             count(*) FILTER (WHERE hot_due_at IS NULL OR hot_due_at <= now())::int AS hot_due_sites,
             count(*) FILTER (WHERE near_due_at IS NULL OR near_due_at <= now())::int AS near_due_sites,
             count(*) FILTER (WHERE planning_due_at IS NULL OR planning_due_at <= now())::int AS planning_due_sites,
             count(*) FILTER (WHERE deep_due_at IS NULL OR deep_due_at <= now())::int AS deep_due_sites
        FROM per_site
    `,
    sql()<Array<{
      id: number;
      scope: string | null;
      status: string;
      started_at: MaybeDate;
      finished_at: MaybeDate;
      sites_updated: number;
      nights_updated: number;
      duration_ms: number | null;
      started_minutes_ago: number | null;
    }>>`
      SELECT id, scope, status, started_at, finished_at,
             sites_updated, nights_updated, duration_ms,
             round(extract(epoch FROM (now() - started_at)) / 60)::int AS started_minutes_ago
        FROM refresh_log
       WHERE refresh_type = 'availability'
       ORDER BY id DESC
       LIMIT 1
    `,
    sql()<Array<{
      runs: number;
      successes: number;
      partials: number;
      failures: number;
      sites_updated: number;
      nights_updated: number;
      average_duration_ms: number | null;
    }>>`
      SELECT count(*)::int AS runs,
             count(*) FILTER (WHERE status = 'success')::int AS successes,
             count(*) FILTER (WHERE status = 'partial')::int AS partials,
             count(*) FILTER (WHERE status = 'failed')::int AS failures,
             COALESCE(sum(sites_updated), 0)::int AS sites_updated,
             COALESCE(sum(nights_updated), 0)::int AS nights_updated,
             round(avg(duration_ms))::int AS average_duration_ms
        FROM refresh_log
       WHERE refresh_type = 'availability'
         AND started_at > now() - interval '1 hour'
    `,
    sql()<Array<{
      scope: string | null;
      runs: number;
      sites_updated: number;
      nights_updated: number;
      latest_started_at: MaybeDate;
      average_duration_ms: number | null;
    }>>`
      SELECT COALESCE(scope, 'all') AS scope,
             count(*)::int AS runs,
             COALESCE(sum(sites_updated), 0)::int AS sites_updated,
             COALESCE(sum(nights_updated), 0)::int AS nights_updated,
             max(started_at) AS latest_started_at,
             round(avg(duration_ms))::int AS average_duration_ms
        FROM refresh_log
       WHERE refresh_type = 'availability'
         AND started_at > now() - interval '6 hours'
       GROUP BY COALESCE(scope, 'all')
       ORDER BY COALESCE(scope, 'all')
    `,
    sql()<Array<{
      operator_id: string;
      operator_name: string;
      operator_vendor: string;
      sites_indexed: number;
      available_today: number;
      checked_last_two_hours: number;
      checked_last_six_hours: number;
      current_p50_minutes: number | null;
      current_p90_minutes: number | null;
      available_p50_minutes: number | null;
      hot_p50_minutes: number | null;
      hot_due_sites: number;
      latest_checked_at: MaybeDate;
      latest_checked_minutes_ago: number | null;
    }>>`
      WITH per_site AS (
        SELECT o.id AS operator_id,
               o.name AS operator_name,
               o.vendor AS operator_vendor,
               s.id AS site_id,
               today.status AS today_status,
               today.last_checked_at AS today_last_checked_at,
               ars.hot_last_checked_at,
               ars.hot_due_at
          FROM sites s
          JOIN campgrounds c ON c.id = s.campground_id
          JOIN parks p ON p.id = c.park_id
          JOIN operators o ON o.id = p.operator_id
          LEFT JOIN site_availability today
                 ON today.site_id = s.id
                AND today.night_date = CURRENT_DATE
          LEFT JOIN availability_refresh_state ars ON ars.site_id = s.id
      )
      SELECT operator_id,
             operator_name,
             operator_vendor,
             count(*)::int AS sites_indexed,
             count(*) FILTER (WHERE today_status = 'available')::int AS available_today,
             count(*) FILTER (WHERE today_last_checked_at > now() - interval '2 hours')::int AS checked_last_two_hours,
             count(*) FILTER (WHERE today_last_checked_at > now() - interval '6 hours')::int AS checked_last_six_hours,
             round((
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - today_last_checked_at)) / 60
               ) FILTER (WHERE today_last_checked_at IS NOT NULL)
             )::numeric)::int AS current_p50_minutes,
             round((
               percentile_cont(0.9) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - today_last_checked_at)) / 60
               ) FILTER (WHERE today_last_checked_at IS NOT NULL)
             )::numeric)::int AS current_p90_minutes,
             round((
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - today_last_checked_at)) / 60
               ) FILTER (WHERE today_status = 'available' AND today_last_checked_at IS NOT NULL)
             )::numeric)::int AS available_p50_minutes,
             round((
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - hot_last_checked_at)) / 60
               ) FILTER (WHERE hot_last_checked_at IS NOT NULL)
             )::numeric)::int AS hot_p50_minutes,
             count(*) FILTER (WHERE hot_due_at IS NULL OR hot_due_at <= now())::int AS hot_due_sites,
             max(today_last_checked_at) AS latest_checked_at,
             round(min(extract(epoch FROM (now() - today_last_checked_at)) / 60))::int AS latest_checked_minutes_ago
        FROM per_site
       GROUP BY operator_id, operator_name, operator_vendor
       ORDER BY
         count(*) FILTER (WHERE today_last_checked_at > now() - interval '2 hours') ASC,
         count(*) FILTER (WHERE hot_due_at IS NULL OR hot_due_at <= now()) DESC,
         operator_name ASC
    `,
  ]);

  const freshnessRow = freshnessRows[0];
  const latest = latestRows[0];
  const recent = recentRows[0];

  return {
    worker: {
      latestRunId: latest ? toNumber(latest.id) : null,
      latestScope: latest?.scope ?? null,
      latestStatus: latest?.status ?? null,
      latestStartedAt: toIso(latest?.started_at ?? null),
      latestFinishedAt: toIso(latest?.finished_at ?? null),
      latestStartedMinutesAgo: toNullableNumber(latest?.started_minutes_ago),
      latestSitesUpdated: toNumber(latest?.sites_updated),
      latestNightsUpdated: toNumber(latest?.nights_updated),
      latestDurationMs: toNullableNumber(latest?.duration_ms),
      runsLastHour: toNumber(recent?.runs),
      successesLastHour: toNumber(recent?.successes),
      partialsLastHour: toNumber(recent?.partials),
      failuresLastHour: toNumber(recent?.failures),
      sitesUpdatedLastHour: toNumber(recent?.sites_updated),
      nightsUpdatedLastHour: toNumber(recent?.nights_updated),
      averageDurationMsLastHour: toNullableNumber(recent?.average_duration_ms),
    },
    freshness: {
      totalSites: toNumber(freshnessRow?.total_sites),
      checkedToday: toNumber(freshnessRow?.checked_today),
      availableToday: toNumber(freshnessRow?.available_today),
      checkedLastHour: toNumber(freshnessRow?.checked_last_hour),
      checkedLastTwoHours: toNumber(freshnessRow?.checked_last_two_hours),
      checkedLastSixHours: toNumber(freshnessRow?.checked_last_six_hours),
      checkedLastTwelveHours: toNumber(freshnessRow?.checked_last_twelve_hours),
      currentP50Minutes: toNullableNumber(freshnessRow?.current_p50_minutes),
      currentP90Minutes: toNullableNumber(freshnessRow?.current_p90_minutes),
      availableP50Minutes: toNullableNumber(freshnessRow?.available_p50_minutes),
      availableP90Minutes: toNullableNumber(freshnessRow?.available_p90_minutes),
      hotP50Minutes: toNullableNumber(freshnessRow?.hot_p50_minutes),
      hotP90Minutes: toNullableNumber(freshnessRow?.hot_p90_minutes),
      hotDueSites: toNumber(freshnessRow?.hot_due_sites),
      nearDueSites: toNumber(freshnessRow?.near_due_sites),
      planningDueSites: toNumber(freshnessRow?.planning_due_sites),
      deepDueSites: toNumber(freshnessRow?.deep_due_sites),
    },
    scopes: scopeRows.map((row) => ({
      scope: row.scope ?? "all",
      runs: toNumber(row.runs),
      sitesUpdated: toNumber(row.sites_updated),
      nightsUpdated: toNumber(row.nights_updated),
      latestStartedAt: toIso(row.latest_started_at),
      averageDurationMs: toNullableNumber(row.average_duration_ms),
    })),
    operators: operatorRows.map((row) => ({
      operator: {
        id: row.operator_id,
        name: row.operator_name,
        vendor: row.operator_vendor as Operator["vendor"],
      },
      sitesIndexed: toNumber(row.sites_indexed),
      availableToday: toNumber(row.available_today),
      checkedLastTwoHours: toNumber(row.checked_last_two_hours),
      checkedLastSixHours: toNumber(row.checked_last_six_hours),
      currentP50Minutes: toNullableNumber(row.current_p50_minutes),
      currentP90Minutes: toNullableNumber(row.current_p90_minutes),
      availableP50Minutes: toNullableNumber(row.available_p50_minutes),
      hotP50Minutes: toNullableNumber(row.hot_p50_minutes),
      hotDueSites: toNumber(row.hot_due_sites),
      latestCheckedAt: toIso(row.latest_checked_at),
      latestCheckedMinutesAgo: toNullableNumber(row.latest_checked_minutes_ago),
      status: operatorStatus(row),
    })),
  };
}
