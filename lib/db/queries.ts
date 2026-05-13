/**
 * Typed repository over Supabase Postgres (postgres-js).
 *
 * All functions are async. Writes are UPSERTs so partial failures preserve the
 * prior snapshot.
 *
 * Read functions use the pooled connection (`sql()`). Writes from ingest
 * scripts use the session-mode connection (`sqlDirect()`) so transactions and
 * prepared statements work.
 */

import { sql, sqlDirect } from "./client";
import type {
  Operator,
  Park,
  Campground,
  Site,
  CampMap,
  SiteType,
  EquipmentOption,
  SiteReview,
  ParkReview,
  SiteReviewAggregate,
  ParkReviewAggregate,
  OperatorRuleSource,
} from "../types";

type PgJsonValue = Parameters<ReturnType<typeof sqlDirect>["json"]>[0];
const asPgJson = (value: unknown): PgJsonValue => value as PgJsonValue;

// ─── Row adapters ───────────────────────────────────────────────────────────

type OperatorRow = {
  id: string; name: string; vendor: string; base_url: string; booking_url: string; active: boolean;
};
function rowToOperator(r: OperatorRow): Operator {
  return {
    id: r.id, name: r.name, vendor: r.vendor as Operator["vendor"],
    base_url: r.base_url, booking_url: r.booking_url, active: r.active,
  };
}

type ParkRow = {
  id: string; operator_id: string; vendor_park_id: string; slug: string; name: string;
  description: string | null; region: string | null; lat: number; lng: number;
  address: string | null; hero_image_url: string | null; vendor_url: string;
};
function rowToPark(r: ParkRow): Park {
  return {
    id: r.id, operator_id: r.operator_id, vendor_park_id: r.vendor_park_id,
    slug: r.slug, name: r.name,
    description: r.description ?? "", region: r.region ?? "",
    location: { lat: r.lat, lng: r.lng }, address: r.address ?? "",
    hero_image_url: r.hero_image_url ?? undefined, vendor_url: r.vendor_url,
  };
}

type CampgroundRow = { id: string; park_id: string; vendor_map_id: string; name: string };
function rowToCampground(r: CampgroundRow): Campground {
  return { id: r.id, park_id: r.park_id, vendor_map_id: r.vendor_map_id, name: r.name };
}

type CampMapRow = {
  id: string; park_id: string; campground_id: string; vendor_map_id: string;
  name: string | null; description: string | null;
  image_url: string; x_dimension: number; y_dimension: number;
  features: unknown;
};
function rowToCampMap(r: CampMapRow): CampMap {
  return {
    id: r.id, park_id: r.park_id, campground_id: r.campground_id,
    vendor_map_id: r.vendor_map_id, name: r.name, description: r.description,
    image_url: r.image_url, x_dimension: r.x_dimension, y_dimension: r.y_dimension,
    features: Array.isArray(r.features) ? (r.features as CampMap["features"]) : [],
  };
}

type SiteRow = {
  id: string; campground_id: string; vendor_site_id: string; name: string; site_type: string;
  site_type_label: string | null; icon_type: number | null;
  max_party_size: number; max_equipment_length_ft: number | null;
  has_electric: boolean; has_water: boolean; has_sewer: boolean; is_pull_through: boolean;
  is_accessible: boolean; is_pet_friendly: boolean; is_waterfront: boolean; amenities: string[];
  camp_map_id: string | null; map_x: number | null; map_y: number | null;
  vendor_resource_location_id: string | number | null;
  vendor_resource_id: string | number | null;
  vendor_booking_category_id: number | null;
  photos: unknown;
  description: string | null;
  min_party_size: number | null;
  max_stay_nights: number | null;
  defined_attributes: unknown;
  allowed_equipment: unknown;
  rule_summary: unknown;
};
function rowToSite(r: SiteRow): Site {
  return {
    id: r.id, campground_id: r.campground_id, vendor_site_id: r.vendor_site_id,
    name: r.name, site_type: r.site_type as SiteType,
    site_type_label: r.site_type_label, icon_type: r.icon_type,
    max_party_size: r.max_party_size, max_equipment_length_ft: r.max_equipment_length_ft,
    has_electric: r.has_electric, has_water: r.has_water, has_sewer: r.has_sewer,
    is_pull_through: r.is_pull_through, is_accessible: r.is_accessible,
    is_pet_friendly: r.is_pet_friendly, is_waterfront: r.is_waterfront,
    amenities: Array.isArray(r.amenities) ? r.amenities : [],
    camp_map_id: r.camp_map_id, map_x: r.map_x, map_y: r.map_y,
    photos: Array.isArray(r.photos) ? (r.photos as Site["photos"]) : [],
    description: r.description,
    min_party_size: r.min_party_size,
    max_stay_nights: r.max_stay_nights,
    defined_attributes: Array.isArray(r.defined_attributes) ? (r.defined_attributes as Site["defined_attributes"]) : [],
    allowed_equipment: Array.isArray(r.allowed_equipment) ? (r.allowed_equipment as Site["allowed_equipment"]) : [],
    rule_summary: r.rule_summary && typeof r.rule_summary === "object" ? (r.rule_summary as Site["rule_summary"]) : null,
  };
}

export type OperatorFetchConfig = {
  operator_id: string;
  campsite_booking_category_id: number;
  equipment_category_id: number;
  sub_equipment_category_id: number;
};

// ─── Reads (use pooler) ─────────────────────────────────────────────────────

export async function getAllOperators(): Promise<Operator[]> {
  const rows = await sql()<OperatorRow[]>`SELECT * FROM operators ORDER BY name`;
  return rows.map(rowToOperator);
}
export async function getAllParks(): Promise<Park[]> {
  const rows = await sql()<ParkRow[]>`SELECT id, operator_id, vendor_park_id, slug, name, description, region, lat, lng, address, hero_image_url, vendor_url FROM parks ORDER BY name`;
  return rows.map(rowToPark);
}
export async function getAllCampgrounds(): Promise<Campground[]> {
  const rows = await sql()<CampgroundRow[]>`SELECT * FROM campgrounds`;
  return rows.map(rowToCampground);
}
export async function getAllCampMaps(): Promise<CampMap[]> {
  const rows = await sql()<CampMapRow[]>`SELECT * FROM camp_maps`;
  return rows.map(rowToCampMap);
}
export async function getAllSites(): Promise<Site[]> {
  const rows = await sql()<SiteRow[]>`
    SELECT id, campground_id, vendor_site_id, name, site_type, site_type_label, icon_type,
           max_party_size, max_equipment_length_ft,
           has_electric, has_water, has_sewer, is_pull_through,
           is_accessible, is_pet_friendly, is_waterfront, amenities,
           camp_map_id, map_x, map_y,
           vendor_resource_location_id, vendor_resource_id, vendor_booking_category_id,
           photos, description, min_party_size, max_stay_nights,
           defined_attributes, allowed_equipment, rule_summary
    FROM sites
  `;
  return rows.map(rowToSite);
}
export async function getAllEquipmentOptions(): Promise<EquipmentOption[]> {
  return (await sql()<EquipmentOption[]>`SELECT operator_id, equipment_category_id, sub_equipment_category_id, name, order_index FROM equipment_categories ORDER BY operator_id, order_index, name`).map((r) => r);
}
export async function getOperatorFetchConfigs(): Promise<OperatorFetchConfig[]> {
  return (await sqlDirect()<OperatorFetchConfig[]>`SELECT * FROM operator_fetch_config`).map((r) => r);
}

export async function getOperatorRuleSource(operatorId: string): Promise<OperatorRuleSource | null> {
  const rows = await sql()<Array<Omit<OperatorRuleSource, "updated_at"> & { updated_at: Date | string | null }>>`
    SELECT operator_id, source_label, source_url, alerts_url, rules, updated_at
      FROM operator_rule_sources
     WHERE operator_id = ${operatorId}
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    rules: Array.isArray(row.rules) ? row.rules : [],
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export type SiteNight = {
  site_id: string;
  night_date: string;
  status: "available" | "reserved" | "closed" | "unknown";
  last_checked_at: string;
};

export async function getSiteAvailabilityForPark(parkId: string): Promise<SiteNight[]> {
  const rows = await sql()<Array<{
    site_id: string;
    night_date: Date | string;
    status: SiteNight["status"];
    last_checked_at: Date | string;
  }>>`
    SELECT sa.site_id,
           sa.night_date,
           sa.status,
           sa.last_checked_at
      FROM site_availability sa
      JOIN sites s        ON s.id = sa.site_id
      JOIN campgrounds c  ON c.id = s.campground_id
     WHERE c.park_id = ${parkId}
     ORDER BY s.vendor_site_id, sa.night_date
  `;
  return rows.map((r) => ({
    site_id: r.site_id,
    night_date: r.night_date instanceof Date ? r.night_date.toISOString().slice(0, 10) : String(r.night_date).slice(0, 10),
    status: r.status,
    last_checked_at: r.last_checked_at instanceof Date ? r.last_checked_at.toISOString() : String(r.last_checked_at),
  }));
}

export type RefreshMeta = { refresh_type: string; last_success_at: string };
export async function getRefreshMeta(): Promise<RefreshMeta[]> {
  const rows = await sql()<Array<{ refresh_type: string; last_success_at: Date }>>`SELECT * FROM refresh_meta`;
  return rows.map((r) => ({
    refresh_type: r.refresh_type,
    last_success_at: r.last_success_at instanceof Date ? r.last_success_at.toISOString() : String(r.last_success_at),
  }));
}

export type RefreshLogRow = {
  id: number;
  refresh_type: string;
  scope: string | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  parks_seen: number;
  sites_seen: number;
  sites_updated: number;
  nights_updated: number;
  duration_ms: number | null;
  errors: string[];
};
type RefreshLogRaw = {
  id: number;
  refresh_type: string;
  scope: string | null;
  started_at: Date | string;
  finished_at: Date | string | null;
  status: string;
  parks_seen: number;
  sites_seen: number;
  sites_updated: number;
  nights_updated: number;
  duration_ms: number | null;
  errors: unknown;
};
export async function getLatestRefreshLogPerType(): Promise<RefreshLogRow[]> {
  const rows = await sql()<RefreshLogRaw[]>`
    SELECT *
      FROM refresh_log
     WHERE id IN (SELECT MAX(id) FROM refresh_log GROUP BY refresh_type, scope)
     ORDER BY refresh_type, scope NULLS FIRST
  `;
  return rows.map((r) => ({
    id: r.id,
    refresh_type: r.refresh_type,
    scope: r.scope,
    started_at: r.started_at instanceof Date ? r.started_at.toISOString() : String(r.started_at),
    finished_at: r.finished_at instanceof Date ? r.finished_at.toISOString() : (r.finished_at as string | null) ?? null,
    status: r.status,
    parks_seen: r.parks_seen,
    sites_seen: r.sites_seen,
    sites_updated: r.sites_updated,
    nights_updated: r.nights_updated,
    duration_ms: r.duration_ms,
    errors: Array.isArray(r.errors) ? (r.errors as string[]) : [],
  }));
}

// ─── Writes (use direct/session-mode connection from ingest scripts) ────────

export type SiteWrite = Site & {
  vendor_resource_location_id: number;
  vendor_resource_id: number;
  vendor_booking_category_id: number;
  source_detail?: unknown;
  source_detail_updated_at?: string;
};

export async function upsertOperator(o: Operator): Promise<void> {
  await sqlDirect()`
    INSERT INTO operators (id, name, vendor, base_url, booking_url, active)
    VALUES (${o.id}, ${o.name}, ${o.vendor}, ${o.base_url}, ${o.booking_url}, ${o.active})
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name, vendor = excluded.vendor,
      base_url = excluded.base_url, booking_url = excluded.booking_url,
      active = excluded.active
  `;
}

export async function upsertOperatorBranding(args: {
  operator_id: string;
  logo_url?: string | null;
  hero_image_url?: string | null;
  website_url?: string | null;
  tagline?: string | null;
  accent_color?: string | null;
}): Promise<void> {
  await sqlDirect()`
    UPDATE operators SET
      logo_url = COALESCE(operators.logo_url, ${args.logo_url ?? null}),
      hero_image_url = COALESCE(operators.hero_image_url, ${args.hero_image_url ?? null}),
      website_url = COALESCE(operators.website_url, ${args.website_url ?? null}),
      tagline = COALESCE(operators.tagline, ${args.tagline ?? null}),
      accent_color = COALESCE(operators.accent_color, ${args.accent_color ?? null})
    WHERE id = ${args.operator_id}
  `;
}

export async function upsertPark(p: Park): Promise<void> {
  await sqlDirect()`
    INSERT INTO parks (id, operator_id, vendor_park_id, slug, name, description, region,
                       lat, lng, address, hero_image_url, vendor_url, updated_at)
    VALUES (${p.id}, ${p.operator_id}, ${p.vendor_park_id}, ${p.slug}, ${p.name},
            ${p.description || null}, ${p.region || null}, ${p.location.lat}, ${p.location.lng},
            ${p.address || null}, ${p.hero_image_url ?? null}, ${p.vendor_url}, now())
    ON CONFLICT (id) DO UPDATE SET
      operator_id = excluded.operator_id, vendor_park_id = excluded.vendor_park_id,
      slug = excluded.slug, name = excluded.name, description = excluded.description,
      region = excluded.region, lat = excluded.lat, lng = excluded.lng,
      address = excluded.address, hero_image_url = COALESCE(parks.hero_image_url, excluded.hero_image_url),
      vendor_url = excluded.vendor_url, updated_at = now()
  `;
}

export async function upsertCampground(c: Campground): Promise<void> {
  await sqlDirect()`
    INSERT INTO campgrounds (id, park_id, vendor_map_id, name)
    VALUES (${c.id}, ${c.park_id}, ${c.vendor_map_id}, ${c.name})
    ON CONFLICT (id) DO UPDATE SET
      park_id = excluded.park_id, vendor_map_id = excluded.vendor_map_id, name = excluded.name
  `;
}

export async function upsertCampMap(cm: CampMap): Promise<void> {
  await sqlDirect()`
    INSERT INTO camp_maps (id, park_id, campground_id, vendor_map_id, name, description,
                           image_url, x_dimension, y_dimension, features)
    VALUES (${cm.id}, ${cm.park_id}, ${cm.campground_id}, ${cm.vendor_map_id},
            ${cm.name}, ${cm.description},
            ${cm.image_url}, ${cm.x_dimension}, ${cm.y_dimension},
            ${sqlDirect().json(cm.features ?? [])})
    ON CONFLICT (id) DO UPDATE SET
      park_id = excluded.park_id, campground_id = excluded.campground_id,
      vendor_map_id = excluded.vendor_map_id, name = excluded.name,
      description = excluded.description, image_url = excluded.image_url,
      x_dimension = excluded.x_dimension, y_dimension = excluded.y_dimension,
      features = excluded.features
  `;
}

export async function upsertSite(s: SiteWrite): Promise<void> {
  await sqlDirect()`
    INSERT INTO sites (id, campground_id, vendor_site_id, name, site_type, site_type_label, icon_type,
                       min_party_size, max_party_size, max_stay_nights, max_equipment_length_ft,
                       has_electric, has_water, has_sewer, is_pull_through,
                       is_accessible, is_pet_friendly, is_waterfront,
                       amenities, camp_map_id, map_x, map_y,
                       vendor_resource_location_id, vendor_resource_id, vendor_booking_category_id,
                       photos, description, defined_attributes, allowed_equipment,
                       rule_summary, source_detail, source_detail_updated_at)
    VALUES (${s.id}, ${s.campground_id}, ${s.vendor_site_id}, ${s.name}, ${s.site_type},
            ${s.site_type_label ?? null}, ${s.icon_type ?? null},
            ${s.min_party_size ?? null}, ${s.max_party_size}, ${s.max_stay_nights ?? null}, ${s.max_equipment_length_ft},
            ${s.has_electric}, ${s.has_water}, ${s.has_sewer}, ${s.is_pull_through},
            ${s.is_accessible}, ${s.is_pet_friendly}, ${s.is_waterfront},
            ${sqlDirect().json(s.amenities)}, ${s.camp_map_id ?? null}, ${s.map_x ?? null}, ${s.map_y ?? null},
            ${s.vendor_resource_location_id}, ${s.vendor_resource_id}, ${s.vendor_booking_category_id},
            ${sqlDirect().json(s.photos ?? [])}, ${s.description ?? null},
            ${sqlDirect().json(s.defined_attributes ?? [])},
            ${sqlDirect().json(s.allowed_equipment ?? [])},
            ${sqlDirect().json(s.rule_summary ?? null)},
            ${sqlDirect().json(asPgJson(s.source_detail ?? {}))},
            ${s.source_detail_updated_at ?? null})
    ON CONFLICT (id) DO UPDATE SET
      campground_id = excluded.campground_id, vendor_site_id = excluded.vendor_site_id,
      name = excluded.name, site_type = excluded.site_type,
      site_type_label = excluded.site_type_label, icon_type = excluded.icon_type,
      min_party_size = excluded.min_party_size,
      max_party_size = excluded.max_party_size,
      max_stay_nights = excluded.max_stay_nights,
      max_equipment_length_ft = excluded.max_equipment_length_ft,
      has_electric = excluded.has_electric, has_water = excluded.has_water,
      has_sewer = excluded.has_sewer, is_pull_through = excluded.is_pull_through,
      is_accessible = excluded.is_accessible, is_pet_friendly = excluded.is_pet_friendly,
      is_waterfront = excluded.is_waterfront, amenities = excluded.amenities,
      camp_map_id = excluded.camp_map_id, map_x = excluded.map_x, map_y = excluded.map_y,
      vendor_resource_location_id = excluded.vendor_resource_location_id,
      vendor_resource_id = excluded.vendor_resource_id,
      vendor_booking_category_id = excluded.vendor_booking_category_id,
      photos = excluded.photos, description = excluded.description,
      defined_attributes = excluded.defined_attributes,
      allowed_equipment = excluded.allowed_equipment,
      rule_summary = excluded.rule_summary,
      source_detail = excluded.source_detail,
      source_detail_updated_at = COALESCE(excluded.source_detail_updated_at, now())
  `;
}

export async function upsertSiteTypeLabel(operator_id: string, icon_type: number, label: string): Promise<void> {
  await sqlDirect()`
    INSERT INTO site_type_labels (operator_id, icon_type, label)
    VALUES (${operator_id}, ${icon_type}, ${label})
    ON CONFLICT (operator_id, icon_type) DO UPDATE SET label = excluded.label
  `;
}

export async function upsertEquipmentOption(e: EquipmentOption): Promise<void> {
  await sqlDirect()`
    INSERT INTO equipment_categories (operator_id, equipment_category_id, sub_equipment_category_id, name, order_index)
    VALUES (${e.operator_id}, ${e.equipment_category_id}, ${e.sub_equipment_category_id}, ${e.name}, ${e.order_index})
    ON CONFLICT (operator_id, equipment_category_id, sub_equipment_category_id) DO UPDATE SET
      name = excluded.name, order_index = excluded.order_index
  `;
}

export async function upsertOperatorFetchConfig(c: OperatorFetchConfig): Promise<void> {
  await sqlDirect()`
    INSERT INTO operator_fetch_config (operator_id, campsite_booking_category_id, equipment_category_id, sub_equipment_category_id)
    VALUES (${c.operator_id}, ${c.campsite_booking_category_id}, ${c.equipment_category_id}, ${c.sub_equipment_category_id})
    ON CONFLICT (operator_id) DO UPDATE SET
      campsite_booking_category_id = excluded.campsite_booking_category_id,
      equipment_category_id = excluded.equipment_category_id,
      sub_equipment_category_id = excluded.sub_equipment_category_id
  `;
}

export async function upsertOperatorRuleSource(source: OperatorRuleSource): Promise<void> {
  await sqlDirect()`
    INSERT INTO operator_rule_sources (operator_id, source_label, source_url, alerts_url, rules, updated_at)
    VALUES (${source.operator_id}, ${source.source_label}, ${source.source_url},
            ${source.alerts_url}, ${sqlDirect().json(source.rules)}, now())
    ON CONFLICT (operator_id) DO UPDATE SET
      source_label = excluded.source_label,
      source_url = excluded.source_url,
      alerts_url = excluded.alerts_url,
      rules = excluded.rules,
      updated_at = now()
  `;
}

export async function upsertOperatorAttributeDefinition(args: {
  operator_id: string;
  attribute_definition_id: number;
  display_name: string;
  order_index: number;
  attribute_type: number;
  is_filterable: boolean;
  is_disabled: boolean;
  is_multi_select: boolean;
  min_value?: number | null;
  max_value?: number | null;
  values: unknown;
  source_raw: unknown;
}): Promise<void> {
  await sqlDirect()`
    INSERT INTO operator_attribute_definitions (
      operator_id, attribute_definition_id, display_name, order_index,
      attribute_type, is_filterable, is_disabled, is_multi_select,
      min_value, max_value, values, source_raw, updated_at
    )
    VALUES (
      ${args.operator_id}, ${args.attribute_definition_id}, ${args.display_name},
      ${args.order_index}, ${args.attribute_type}, ${args.is_filterable},
      ${args.is_disabled}, ${args.is_multi_select}, ${args.min_value ?? null},
      ${args.max_value ?? null}, ${sqlDirect().json(asPgJson(args.values))},
      ${sqlDirect().json(asPgJson(args.source_raw))}, now()
    )
    ON CONFLICT (operator_id, attribute_definition_id) DO UPDATE SET
      display_name = excluded.display_name,
      order_index = excluded.order_index,
      attribute_type = excluded.attribute_type,
      is_filterable = excluded.is_filterable,
      is_disabled = excluded.is_disabled,
      is_multi_select = excluded.is_multi_select,
      min_value = excluded.min_value,
      max_value = excluded.max_value,
      values = excluded.values,
      source_raw = excluded.source_raw,
      updated_at = now()
  `;
}

/** Batched UPSERT of (site, night, status) rows using postgres-js's bulk insert. */
export async function upsertSiteAvailabilityBatch(rows: SiteNight[]): Promise<void> {
  if (rows.length === 0) return;
  await sqlDirect()`
    INSERT INTO site_availability ${sqlDirect()(rows, "site_id", "night_date", "status", "last_checked_at")}
    ON CONFLICT (site_id, night_date) DO UPDATE SET
      status = excluded.status, last_checked_at = excluded.last_checked_at
  `;
}

export async function startRefreshLog(refresh_type: "metadata" | "availability", scope: string | null): Promise<number> {
  const rows = await sqlDirect()<{ id: number }[]>`
    INSERT INTO refresh_log (refresh_type, scope, started_at, status)
    VALUES (${refresh_type}, ${scope}, now(), 'running')
    RETURNING id
  `;
  return rows[0].id;
}

export async function finishRefreshLog(args: {
  id: number;
  status: "success" | "partial" | "failed";
  parks_seen?: number;
  sites_seen?: number;
  sites_updated?: number;
  nights_updated?: number;
  duration_ms?: number;
  errors?: string[];
}): Promise<void> {
  await sqlDirect()`
    UPDATE refresh_log SET
      finished_at = now(),
      status = ${args.status},
      parks_seen = ${args.parks_seen ?? 0},
      sites_seen = ${args.sites_seen ?? 0},
      sites_updated = ${args.sites_updated ?? 0},
      nights_updated = ${args.nights_updated ?? 0},
      duration_ms = ${args.duration_ms ?? null},
      errors = ${sqlDirect().json(args.errors ?? [])}
    WHERE id = ${args.id}
  `;
}

export async function setRefreshMeta(refresh_type: "metadata" | "availability"): Promise<void> {
  await sqlDirect()`
    INSERT INTO refresh_meta (refresh_type, last_success_at)
    VALUES (${refresh_type}, now())
    ON CONFLICT (refresh_type) DO UPDATE SET last_success_at = now()
  `;
}

export async function recordRateLimitEvent(input: {
  action: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = Math.max(1, Math.floor(input.limit));
  const windowSeconds = Math.max(1, Math.floor(input.windowSeconds));
  const rows = await sql()<Array<{ allowed: boolean; count: number; limit: number }>>`
    WITH pruned AS (
      DELETE FROM app_rate_limit_events
       WHERE created_at < now() - interval '2 days'
    ),
    recent AS (
      SELECT count(*)::int AS count
        FROM app_rate_limit_events
       WHERE action = ${input.action}
         AND rate_key = ${input.key}
         AND created_at >= now() - (${windowSeconds} * interval '1 second')
    ),
    inserted AS (
      INSERT INTO app_rate_limit_events (action, rate_key)
      SELECT ${input.action}, ${input.key}
       WHERE (SELECT count FROM recent) < ${limit}
      RETURNING id
    )
    SELECT EXISTS(SELECT 1 FROM inserted) AS allowed,
           (SELECT count FROM recent) AS count,
           ${limit}::int AS limit
  `;
  return rows[0] ?? { allowed: false, count: limit, limit };
}

export async function pruneStaleAvailability(cutoff_date: string): Promise<number> {
  const rows = await sqlDirect()`DELETE FROM site_availability WHERE night_date < ${cutoff_date}`;
  return rows.count;
}

/** Refresh only hot-path denormalized columns. This is intentionally separate
 *  from analytics materialized views so frequent availability runs stay cheap. */
export async function refreshRollups(): Promise<void> {
  await sqlDirect()`
    WITH park_stats AS (
      SELECT p.id AS park_id,
             count(DISTINCT c.id)::int AS cgs,
             count(DISTINCT s.id)::int AS total_sites,
             count(DISTINCT s.id) FILTER (WHERE sa.status = 'available')::int AS avail_sites,
             max(sa.last_checked_at) AS last_check
        FROM parks p
        LEFT JOIN campgrounds c ON c.park_id = p.id
        LEFT JOIN sites s ON s.campground_id = c.id
        LEFT JOIN site_availability sa
               ON sa.site_id = s.id
              AND sa.night_date = CURRENT_DATE
       GROUP BY p.id
    )
    UPDATE parks
       SET total_campgrounds = park_stats.cgs,
           total_sites = park_stats.total_sites,
           available_sites = park_stats.avail_sites,
           availability_pct = CASE WHEN park_stats.total_sites = 0 THEN 0
                                   ELSE (100.0 * park_stats.avail_sites / park_stats.total_sites)::int END,
           last_availability_at = park_stats.last_check
      FROM park_stats
     WHERE park_stats.park_id = parks.id
  `;

  await sqlDirect()`
    WITH operator_stats AS (
      SELECT o.id AS op_id,
             count(DISTINCT p.id)::int AS parks_n,
             count(DISTINCT c.id)::int AS cgs_n,
             count(DISTINCT s.id)::int AS sites_n,
             count(DISTINCT s.id) FILTER (WHERE sa.status = 'available')::int AS avail_n,
             max(sa.last_checked_at) AS last_check
        FROM operators o
        LEFT JOIN parks p ON p.operator_id = o.id
        LEFT JOIN campgrounds c ON c.park_id = p.id
        LEFT JOIN sites s ON s.campground_id = c.id
        LEFT JOIN site_availability sa
               ON sa.site_id = s.id
              AND sa.night_date = CURRENT_DATE
       GROUP BY o.id
    )
    UPDATE operators
       SET total_parks = operator_stats.parks_n,
           total_campgrounds = operator_stats.cgs_n,
           total_sites = operator_stats.sites_n,
           available_sites = operator_stats.avail_n,
           last_availability_at = operator_stats.last_check
      FROM operator_stats
     WHERE operator_stats.op_id = operators.id
  `;
}

/** Refresh denormalized columns + materialized views. Use on slower analytics
 *  cadence, not for every frequent availability ingest. */
export async function refreshAggregates(): Promise<void> {
  await sqlDirect()`SELECT refresh_aggregates()`;
}

// ─── Review reads ─────────────────────────────────────────────────────────────

type SiteReviewRow = {
  id: string; site_id: string; author_handle: string;
  overall: number; privacy: number | null; cleanliness: number | null;
  noise: number | null; site_size: number | null; shade: number | null;
  title: string | null; body: string; visited_at: Date | string | null;
  created_at: Date | string;
};

function rowToSiteReview(r: SiteReviewRow): SiteReview {
  return {
    id: r.id, site_id: r.site_id, author_handle: r.author_handle,
    overall: r.overall, privacy: r.privacy, cleanliness: r.cleanliness,
    noise: r.noise, site_size: r.site_size, shade: r.shade,
    title: r.title, body: r.body,
    visited_at: r.visited_at instanceof Date ? r.visited_at.toISOString().slice(0, 10) : (r.visited_at as string | null),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

type ParkReviewRow = {
  id: string; park_id: string; author_handle: string;
  overall: number; facilities: number | null; trails: number | null;
  beach: number | null; privacy: number | null; noise: number | null;
  title: string | null; body: string; visited_at: Date | string | null;
  created_at: Date | string;
};

function rowToParkReview(r: ParkReviewRow): ParkReview {
  return {
    id: r.id, park_id: r.park_id, author_handle: r.author_handle,
    overall: r.overall, facilities: r.facilities, trails: r.trails,
    beach: r.beach, privacy: r.privacy, noise: r.noise,
    title: r.title, body: r.body,
    visited_at: r.visited_at instanceof Date ? r.visited_at.toISOString().slice(0, 10) : (r.visited_at as string | null),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function getSiteReviews(siteId: string, limit = 20, offset = 0): Promise<SiteReview[]> {
  const rows = await sql()<SiteReviewRow[]>`
    SELECT id, site_id, author_handle, overall, privacy, cleanliness, noise, site_size, shade,
           title, body, visited_at, created_at
      FROM site_reviews
     WHERE site_id = ${siteId} AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(rowToSiteReview);
}

export async function getSiteReviewAggregate(siteId: string): Promise<SiteReviewAggregate> {
  const rows = await sql()<Array<{
    review_count: number; rating_avg: number | null;
    rating_privacy: number | null; rating_cleanliness: number | null;
    rating_noise: number | null; rating_site_size: number | null; rating_shade: number | null;
  }>>`
    SELECT review_count, rating_avg, rating_privacy, rating_cleanliness,
           rating_noise, rating_site_size, rating_shade
      FROM sites WHERE id = ${siteId}
  `;
  return rows[0] ?? { review_count: 0, rating_avg: null, rating_privacy: null, rating_cleanliness: null, rating_noise: null, rating_site_size: null, rating_shade: null };
}

export async function getParkReviews(parkId: string, limit = 20, offset = 0): Promise<ParkReview[]> {
  const rows = await sql()<ParkReviewRow[]>`
    SELECT id, park_id, author_handle, overall, facilities, trails, beach, privacy, noise,
           title, body, visited_at, created_at
      FROM park_reviews
     WHERE park_id = ${parkId} AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}
  `;
  return rows.map(rowToParkReview);
}

export async function getParkReviewAggregate(parkId: string): Promise<ParkReviewAggregate> {
  const rows = await sql()<Array<{
    review_count: number; rating_avg: number | null;
    rating_facilities: number | null; rating_trails: number | null;
    rating_beach: number | null; rating_privacy: number | null; rating_noise: number | null;
  }>>`
    SELECT review_count, rating_avg, rating_facilities, rating_trails,
           rating_beach, rating_privacy, rating_noise
      FROM parks WHERE id = ${parkId}
  `;
  return rows[0] ?? { review_count: 0, rating_avg: null, rating_facilities: null, rating_trails: null, rating_beach: null, rating_privacy: null, rating_noise: null };
}

export async function getRecentSiteReviewsForPark(parkId: string, limit = 5): Promise<Array<SiteReview & { site_name: string }>> {
  const rows = await sql()<Array<SiteReviewRow & { site_name: string }>>`
    SELECT sr.id, sr.site_id, sr.author_handle, sr.overall, sr.privacy, sr.cleanliness,
           sr.noise, sr.site_size, sr.shade, sr.title, sr.body, sr.visited_at, sr.created_at,
           s.name AS site_name
      FROM site_reviews sr
      JOIN sites s ON s.id = sr.site_id
      JOIN campgrounds c ON c.id = s.campground_id
     WHERE c.park_id = ${parkId} AND sr.status = 'approved'
     ORDER BY sr.created_at DESC
     LIMIT ${limit}
  `;
  return rows.map((r) => ({ ...rowToSiteReview(r), site_name: r.site_name }));
}

export async function getSiteReviewStatsForPark(parkId: string): Promise<Array<{ site_id: string; review_count: number; rating_avg: number | null }>> {
  const rows = await sql()<Array<{ site_id: string; review_count: number; rating_avg: number | null }>>`
    SELECT s.id AS site_id, COALESCE(s.review_count, 0) AS review_count, s.rating_avg
      FROM sites s
      JOIN campgrounds c ON c.id = s.campground_id
     WHERE c.park_id = ${parkId}
  `;
  return rows;
}

// ─── Review writes ────────────────────────────────────────────────────────────

export async function insertSiteReview(input: {
  site_id: string; author_handle: string;
  overall: number; privacy?: number; cleanliness?: number;
  noise?: number; site_size?: number; shade?: number;
  title?: string; body: string; visited_at?: string;
  submitter_hash?: string;
}): Promise<string> {
  const rows = await sqlDirect()<{ id: string }[]>`
    INSERT INTO site_reviews (site_id, author_handle, overall, privacy, cleanliness, noise, site_size, shade, title, body, visited_at, submitter_hash)
    VALUES (${input.site_id}, ${input.author_handle}, ${input.overall},
            ${input.privacy ?? null}, ${input.cleanliness ?? null},
            ${input.noise ?? null}, ${input.site_size ?? null}, ${input.shade ?? null},
            ${input.title ?? null}, ${input.body}, ${input.visited_at ?? null},
            ${input.submitter_hash ?? null})
    RETURNING id
  `;
  return rows[0].id;
}

export async function insertParkReview(input: {
  park_id: string; author_handle: string;
  overall: number; facilities?: number; trails?: number;
  beach?: number; privacy?: number; noise?: number;
  title?: string; body: string; visited_at?: string;
  submitter_hash?: string;
}): Promise<string> {
  const rows = await sqlDirect()<{ id: string }[]>`
    INSERT INTO park_reviews (park_id, author_handle, overall, facilities, trails, beach, privacy, noise, title, body, visited_at, submitter_hash)
    VALUES (${input.park_id}, ${input.author_handle}, ${input.overall},
            ${input.facilities ?? null}, ${input.trails ?? null},
            ${input.beach ?? null}, ${input.privacy ?? null}, ${input.noise ?? null},
            ${input.title ?? null}, ${input.body}, ${input.visited_at ?? null},
            ${input.submitter_hash ?? null})
    RETURNING id
  `;
  return rows[0].id;
}
