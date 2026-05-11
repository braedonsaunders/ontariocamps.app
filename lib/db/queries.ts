/**
 * Typed repository over the SQLite schema.
 *
 * Writes are UPSERTs so partial failures preserve the existing snapshot.
 * Reads are simple `SELECT … WHERE …` statements that translate 1:1 to
 * Postgres when we move to Supabase.
 *
 * Architecture:
 *   - Metadata (operators, parks, sites, camp_maps, etc.) lives in static
 *     tables refreshed weekly by `lib/ingest/metadata.ts`.
 *   - Availability (per-night status per site) lives in `site_availability`,
 *     refreshed frequently by `lib/ingest/availability.ts`.
 */

import { db } from "./client";
import type {
  Operator,
  Park,
  Campground,
  Site,
  CampMap,
  SiteType,
  EquipmentOption,
} from "../types";

// ─── Row → object adapters ──────────────────────────────────────────────────

type OperatorRow = {
  id: string; name: string; vendor: string; base_url: string; booking_url: string; active: number;
};
function rowToOperator(r: OperatorRow): Operator {
  return {
    id: r.id, name: r.name, vendor: r.vendor as Operator["vendor"],
    base_url: r.base_url, booking_url: r.booking_url, active: r.active === 1,
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
  name: string | null; image_url: string; x_dimension: number; y_dimension: number;
};
function rowToCampMap(r: CampMapRow): CampMap {
  return {
    id: r.id, park_id: r.park_id, campground_id: r.campground_id,
    vendor_map_id: r.vendor_map_id, name: r.name, image_url: r.image_url,
    x_dimension: r.x_dimension, y_dimension: r.y_dimension,
  };
}

type SiteRow = {
  id: string; campground_id: string; vendor_site_id: string; name: string; site_type: string;
  site_type_label: string | null; icon_type: number | null;
  max_party_size: number; max_equipment_length_ft: number | null;
  has_electric: number; has_water: number; has_sewer: number; is_pull_through: number;
  is_accessible: number; is_pet_friendly: number; is_waterfront: number; amenities: string;
  camp_map_id: string | null; map_x: number | null; map_y: number | null;
  vendor_resource_location_id: number | null;
  vendor_resource_id: number | null;
  vendor_booking_category_id: number | null;
};
function rowToSite(r: SiteRow): Site {
  return {
    id: r.id, campground_id: r.campground_id, vendor_site_id: r.vendor_site_id,
    name: r.name, site_type: r.site_type as SiteType,
    site_type_label: r.site_type_label, icon_type: r.icon_type,
    max_party_size: r.max_party_size, max_equipment_length_ft: r.max_equipment_length_ft,
    has_electric: r.has_electric === 1, has_water: r.has_water === 1, has_sewer: r.has_sewer === 1,
    is_pull_through: r.is_pull_through === 1, is_accessible: r.is_accessible === 1,
    is_pet_friendly: r.is_pet_friendly === 1, is_waterfront: r.is_waterfront === 1,
    amenities: JSON.parse(r.amenities) as string[],
    camp_map_id: r.camp_map_id, map_x: r.map_x, map_y: r.map_y,
  };
}

export type OperatorFetchConfig = {
  operator_id: string;
  campsite_booking_category_id: number;
  equipment_category_id: number;
  sub_equipment_category_id: number;
};

// ─── Read API ───────────────────────────────────────────────────────────────

export function getAllOperators(): Operator[] {
  return db().prepare(`SELECT * FROM operators ORDER BY name`).all().map((r) => rowToOperator(r as OperatorRow));
}
export function getAllParks(): Park[] {
  return db().prepare(`SELECT * FROM parks ORDER BY name`).all().map((r) => rowToPark(r as ParkRow));
}
export function getAllCampgrounds(): Campground[] {
  return db().prepare(`SELECT * FROM campgrounds`).all().map((r) => rowToCampground(r as CampgroundRow));
}
export function getAllCampMaps(): CampMap[] {
  return db().prepare(`SELECT * FROM camp_maps`).all().map((r) => rowToCampMap(r as CampMapRow));
}
export function getAllSites(): Site[] {
  return db().prepare(`SELECT * FROM sites`).all().map((r) => rowToSite(r as SiteRow));
}
export function getAllEquipmentOptions(): EquipmentOption[] {
  return db()
    .prepare(`SELECT * FROM equipment_categories ORDER BY operator_id, order_index, name`)
    .all() as EquipmentOption[];
}
export function getOperatorFetchConfigs(): OperatorFetchConfig[] {
  return db().prepare(`SELECT * FROM operator_fetch_config`).all() as OperatorFetchConfig[];
}

// Availability reads ─ source of truth for the calendar, analytics, search.

export type SiteNight = {
  site_id: string;
  night_date: string;
  status: "available" | "reserved" | "closed" | "unknown";
  last_checked_at: string;
};

export function getSiteAvailabilityForPark(parkId: string): SiteNight[] {
  return db()
    .prepare(
      `SELECT sa.site_id, sa.night_date, sa.status, sa.last_checked_at
         FROM site_availability sa
         JOIN sites s        ON s.id = sa.site_id
         JOIN campgrounds c  ON c.id = s.campground_id
        WHERE c.park_id = ?
        ORDER BY s.vendor_site_id, sa.night_date`,
    )
    .all(parkId) as SiteNight[];
}

export type RefreshMeta = { refresh_type: string; last_success_at: string };
export function getRefreshMeta(): RefreshMeta[] {
  return db().prepare(`SELECT * FROM refresh_meta`).all() as RefreshMeta[];
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
  errors: string;
};
export function getLatestRefreshLogPerType(): RefreshLogRow[] {
  return db()
    .prepare(
      `SELECT * FROM refresh_log
        WHERE id IN (SELECT MAX(id) FROM refresh_log GROUP BY refresh_type, scope)
        ORDER BY refresh_type, scope`,
    )
    .all() as RefreshLogRow[];
}

// ─── Write API (UPSERT-based) ────────────────────────────────────────────────

/** Wraps a callback in a transaction so its writes are atomic. */
export function inTransaction<T>(fn: () => T): T {
  const handle = db();
  const trx = handle.transaction(fn);
  return trx() as T;
}

export const upsertOperator = (o: Operator): void => {
  db().prepare(
    `INSERT INTO operators (id, name, vendor, base_url, booking_url, active)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, vendor=excluded.vendor,
       base_url=excluded.base_url, booking_url=excluded.booking_url,
       active=excluded.active`,
  ).run(o.id, o.name, o.vendor, o.base_url, o.booking_url, o.active ? 1 : 0);
};

export const upsertPark = (p: Park): void => {
  db().prepare(
    `INSERT INTO parks (id, operator_id, vendor_park_id, slug, name, description, region,
                        lat, lng, address, hero_image_url, vendor_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       operator_id=excluded.operator_id, vendor_park_id=excluded.vendor_park_id,
       slug=excluded.slug, name=excluded.name, description=excluded.description,
       region=excluded.region, lat=excluded.lat, lng=excluded.lng,
       address=excluded.address, hero_image_url=excluded.hero_image_url,
       vendor_url=excluded.vendor_url, updated_at=CURRENT_TIMESTAMP`,
  ).run(
    p.id, p.operator_id, p.vendor_park_id, p.slug, p.name,
    p.description || null, p.region || null, p.location.lat, p.location.lng,
    p.address || null, p.hero_image_url ?? null, p.vendor_url,
  );
};

export const upsertCampground = (c: Campground): void => {
  db().prepare(
    `INSERT INTO campgrounds (id, park_id, vendor_map_id, name)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       park_id=excluded.park_id, vendor_map_id=excluded.vendor_map_id, name=excluded.name`,
  ).run(c.id, c.park_id, c.vendor_map_id, c.name);
};

export const upsertCampMap = (cm: CampMap): void => {
  db().prepare(
    `INSERT INTO camp_maps (id, park_id, campground_id, vendor_map_id, name, image_url,
                             x_dimension, y_dimension)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       park_id=excluded.park_id, campground_id=excluded.campground_id,
       vendor_map_id=excluded.vendor_map_id, name=excluded.name,
       image_url=excluded.image_url, x_dimension=excluded.x_dimension,
       y_dimension=excluded.y_dimension`,
  ).run(cm.id, cm.park_id, cm.campground_id, cm.vendor_map_id, cm.name,
        cm.image_url, cm.x_dimension, cm.y_dimension);
};

export type SiteWrite = Site & {
  vendor_resource_location_id: number;
  vendor_resource_id: number;
  vendor_booking_category_id: number;
};
export const upsertSite = (s: SiteWrite): void => {
  db().prepare(
    `INSERT INTO sites (
       id, campground_id, vendor_site_id, name, site_type, site_type_label, icon_type,
       max_party_size, max_equipment_length_ft,
       has_electric, has_water, has_sewer, is_pull_through,
       is_accessible, is_pet_friendly, is_waterfront,
       amenities, camp_map_id, map_x, map_y,
       vendor_resource_location_id, vendor_resource_id, vendor_booking_category_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       campground_id=excluded.campground_id, vendor_site_id=excluded.vendor_site_id,
       name=excluded.name, site_type=excluded.site_type,
       site_type_label=excluded.site_type_label, icon_type=excluded.icon_type,
       max_party_size=excluded.max_party_size,
       max_equipment_length_ft=excluded.max_equipment_length_ft,
       has_electric=excluded.has_electric, has_water=excluded.has_water,
       has_sewer=excluded.has_sewer, is_pull_through=excluded.is_pull_through,
       is_accessible=excluded.is_accessible, is_pet_friendly=excluded.is_pet_friendly,
       is_waterfront=excluded.is_waterfront, amenities=excluded.amenities,
       camp_map_id=excluded.camp_map_id, map_x=excluded.map_x, map_y=excluded.map_y,
       vendor_resource_location_id=excluded.vendor_resource_location_id,
       vendor_resource_id=excluded.vendor_resource_id,
       vendor_booking_category_id=excluded.vendor_booking_category_id`,
  ).run(
    s.id, s.campground_id, s.vendor_site_id, s.name, s.site_type, s.site_type_label ?? null, s.icon_type ?? null,
    s.max_party_size, s.max_equipment_length_ft,
    s.has_electric ? 1 : 0, s.has_water ? 1 : 0, s.has_sewer ? 1 : 0, s.is_pull_through ? 1 : 0,
    s.is_accessible ? 1 : 0, s.is_pet_friendly ? 1 : 0, s.is_waterfront ? 1 : 0,
    JSON.stringify(s.amenities), s.camp_map_id ?? null, s.map_x ?? null, s.map_y ?? null,
    s.vendor_resource_location_id, s.vendor_resource_id, s.vendor_booking_category_id,
  );
};

export const upsertSiteTypeLabel = (operator_id: string, icon_type: number, label: string): void => {
  db().prepare(
    `INSERT INTO site_type_labels (operator_id, icon_type, label) VALUES (?, ?, ?)
     ON CONFLICT(operator_id, icon_type) DO UPDATE SET label=excluded.label`,
  ).run(operator_id, icon_type, label);
};

export const upsertEquipmentOption = (e: EquipmentOption): void => {
  db().prepare(
    `INSERT INTO equipment_categories (operator_id, equipment_category_id, sub_equipment_category_id, name, order_index)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(operator_id, equipment_category_id, sub_equipment_category_id) DO UPDATE SET
       name=excluded.name, order_index=excluded.order_index`,
  ).run(e.operator_id, e.equipment_category_id, e.sub_equipment_category_id, e.name, e.order_index);
};

export const upsertOperatorFetchConfig = (c: OperatorFetchConfig): void => {
  db().prepare(
    `INSERT INTO operator_fetch_config (operator_id, campsite_booking_category_id, equipment_category_id, sub_equipment_category_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(operator_id) DO UPDATE SET
       campsite_booking_category_id=excluded.campsite_booking_category_id,
       equipment_category_id=excluded.equipment_category_id,
       sub_equipment_category_id=excluded.sub_equipment_category_id`,
  ).run(c.operator_id, c.campsite_booking_category_id, c.equipment_category_id, c.sub_equipment_category_id);
};

/** Batched UPSERT of (site, night, status) rows. The availability ingest streams
 *  results through here in batches so a long run doesn't keep the txn open. */
export function upsertSiteAvailabilityBatch(rows: SiteNight[]): void {
  if (rows.length === 0) return;
  const stmt = db().prepare(
    `INSERT INTO site_availability (site_id, night_date, status, last_checked_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(site_id, night_date) DO UPDATE SET
       status=excluded.status, last_checked_at=excluded.last_checked_at`,
  );
  const trx = db().transaction((batch: SiteNight[]) => {
    for (const r of batch) stmt.run(r.site_id, r.night_date, r.status, r.last_checked_at);
  });
  trx(rows);
}

export function startRefreshLog(refresh_type: "metadata" | "availability", scope: string | null): number {
  const info = db().prepare(
    `INSERT INTO refresh_log (refresh_type, scope, started_at, status) VALUES (?, ?, ?, 'running')`,
  ).run(refresh_type, scope, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export function finishRefreshLog(args: {
  id: number;
  status: "success" | "partial" | "failed";
  parks_seen?: number;
  sites_seen?: number;
  sites_updated?: number;
  nights_updated?: number;
  duration_ms?: number;
  errors?: string[];
}): void {
  db().prepare(
    `UPDATE refresh_log SET
       finished_at = ?, status = ?,
       parks_seen = ?, sites_seen = ?, sites_updated = ?,
       nights_updated = ?, duration_ms = ?, errors = ?
     WHERE id = ?`,
  ).run(
    new Date().toISOString(), args.status,
    args.parks_seen ?? 0, args.sites_seen ?? 0, args.sites_updated ?? 0,
    args.nights_updated ?? 0, args.duration_ms ?? null,
    JSON.stringify(args.errors ?? []),
    args.id,
  );
}

export function setRefreshMeta(refresh_type: "metadata" | "availability"): void {
  db().prepare(
    `INSERT INTO refresh_meta (refresh_type, last_success_at) VALUES (?, ?)
     ON CONFLICT(refresh_type) DO UPDATE SET last_success_at=excluded.last_success_at`,
  ).run(refresh_type, new Date().toISOString());
}

/** Remove site_availability rows older than `cutoff_date` (ISO date string).
 *  Called by the availability refresh to drop nights that fell outside the
 *  ingest window. */
export function pruneStaleAvailability(cutoff_date: string): number {
  const info = db().prepare(`DELETE FROM site_availability WHERE night_date < ?`).run(cutoff_date);
  return info.changes;
}
