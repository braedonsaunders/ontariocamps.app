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
} from "../types";

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
           vendor_resource_location_id, vendor_resource_id, vendor_booking_category_id
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
      address = excluded.address, hero_image_url = excluded.hero_image_url,
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
                       max_party_size, max_equipment_length_ft,
                       has_electric, has_water, has_sewer, is_pull_through,
                       is_accessible, is_pet_friendly, is_waterfront,
                       amenities, camp_map_id, map_x, map_y,
                       vendor_resource_location_id, vendor_resource_id, vendor_booking_category_id,
                       photos, description)
    VALUES (${s.id}, ${s.campground_id}, ${s.vendor_site_id}, ${s.name}, ${s.site_type},
            ${s.site_type_label ?? null}, ${s.icon_type ?? null},
            ${s.max_party_size}, ${s.max_equipment_length_ft},
            ${s.has_electric}, ${s.has_water}, ${s.has_sewer}, ${s.is_pull_through},
            ${s.is_accessible}, ${s.is_pet_friendly}, ${s.is_waterfront},
            ${sqlDirect().json(s.amenities)}, ${s.camp_map_id ?? null}, ${s.map_x ?? null}, ${s.map_y ?? null},
            ${s.vendor_resource_location_id}, ${s.vendor_resource_id}, ${s.vendor_booking_category_id},
            ${sqlDirect().json(s.photos ?? [])}, ${s.description ?? null})
    ON CONFLICT (id) DO UPDATE SET
      campground_id = excluded.campground_id, vendor_site_id = excluded.vendor_site_id,
      name = excluded.name, site_type = excluded.site_type,
      site_type_label = excluded.site_type_label, icon_type = excluded.icon_type,
      max_party_size = excluded.max_party_size,
      max_equipment_length_ft = excluded.max_equipment_length_ft,
      has_electric = excluded.has_electric, has_water = excluded.has_water,
      has_sewer = excluded.has_sewer, is_pull_through = excluded.is_pull_through,
      is_accessible = excluded.is_accessible, is_pet_friendly = excluded.is_pet_friendly,
      is_waterfront = excluded.is_waterfront, amenities = excluded.amenities,
      camp_map_id = excluded.camp_map_id, map_x = excluded.map_x, map_y = excluded.map_y,
      vendor_resource_location_id = excluded.vendor_resource_location_id,
      vendor_resource_id = excluded.vendor_resource_id,
      vendor_booking_category_id = excluded.vendor_booking_category_id,
      photos = excluded.photos, description = excluded.description
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

export async function pruneStaleAvailability(cutoff_date: string): Promise<number> {
  const rows = await sqlDirect()`DELETE FROM site_availability WHERE night_date < ${cutoff_date}`;
  return rows.count;
}

/** Refresh denormalized columns + materialized views. Called at the tail of
 *  every availability ingest run. */
export async function refreshAggregates(): Promise<void> {
  await sqlDirect()`SELECT refresh_aggregates()`;
}
