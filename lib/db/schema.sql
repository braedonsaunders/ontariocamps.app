-- ontariocamps.app — relational schema (v2)
--
-- Design principle: separate **static** data (operators, parks, sites — change
-- weekly at most) from **dynamic** data (per-night availability — changes
-- constantly). They have their own refresh cadences and their own scripts.
--
-- All writes are UPSERTs so a partial failure preserves the prior snapshot.
-- The schema is idempotent: re-running it is a no-op.

PRAGMA foreign_keys = ON;

-- ─── Static metadata ──────────────────────────────────────────────────────
-- Refreshed weekly by `npm run ingest:metadata`.

CREATE TABLE IF NOT EXISTS operators (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  vendor       TEXT NOT NULL,
  base_url     TEXT NOT NULL,
  booking_url  TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS parks (
  id             TEXT PRIMARY KEY,
  operator_id    TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  vendor_park_id TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT,
  region         TEXT,
  lat            REAL NOT NULL,
  lng            REAL NOT NULL,
  address        TEXT,
  hero_image_url TEXT,
  vendor_url     TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (operator_id, vendor_park_id)
);
CREATE INDEX IF NOT EXISTS parks_operator_idx ON parks(operator_id);
CREATE INDEX IF NOT EXISTS parks_location_idx ON parks(lat, lng);

CREATE TABLE IF NOT EXISTS campgrounds (
  id            TEXT PRIMARY KEY,
  park_id       TEXT NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  vendor_map_id TEXT NOT NULL,
  name          TEXT NOT NULL,
  UNIQUE (park_id, vendor_map_id)
);
CREATE INDEX IF NOT EXISTS campgrounds_park_idx ON campgrounds(park_id);

CREATE TABLE IF NOT EXISTS camp_maps (
  id            TEXT PRIMARY KEY,
  park_id       TEXT NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  campground_id TEXT NOT NULL REFERENCES campgrounds(id) ON DELETE CASCADE,
  vendor_map_id TEXT NOT NULL,
  name          TEXT,
  image_url     TEXT NOT NULL,
  x_dimension   INTEGER NOT NULL,
  y_dimension   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS camp_maps_park_idx ON camp_maps(park_id);

CREATE TABLE IF NOT EXISTS sites (
  id                       TEXT PRIMARY KEY,
  campground_id            TEXT NOT NULL REFERENCES campgrounds(id) ON DELETE CASCADE,
  vendor_site_id           TEXT NOT NULL,
  name                     TEXT NOT NULL,
  site_type                TEXT NOT NULL,
  site_type_label          TEXT,
  icon_type                INTEGER,
  min_party_size           INTEGER,
  max_party_size           INTEGER NOT NULL,
  max_stay_nights          INTEGER,
  max_equipment_length_ft  INTEGER,
  has_electric             INTEGER NOT NULL DEFAULT 0,
  has_water                INTEGER NOT NULL DEFAULT 0,
  has_sewer                INTEGER NOT NULL DEFAULT 0,
  is_pull_through          INTEGER NOT NULL DEFAULT 0,
  is_accessible            INTEGER NOT NULL DEFAULT 0,
  is_pet_friendly          INTEGER NOT NULL DEFAULT 1,
  is_waterfront            INTEGER NOT NULL DEFAULT 0,
  amenities                TEXT NOT NULL DEFAULT '[]',
  camp_map_id              TEXT REFERENCES camp_maps(id),
  map_x                    INTEGER,
  map_y                    INTEGER,
  -- Camis-side identifiers needed for the availability fetch (which queries
  -- by resourceLocationId + resourceId + booking category).
  vendor_resource_location_id INTEGER,
  vendor_resource_id          INTEGER,
  vendor_booking_category_id  INTEGER,
  defined_attributes          TEXT NOT NULL DEFAULT '[]',
  allowed_equipment           TEXT NOT NULL DEFAULT '[]',
  rule_summary                TEXT NOT NULL DEFAULT '{}',
  source_detail               TEXT NOT NULL DEFAULT '{}',
  source_detail_updated_at    TEXT,
  UNIQUE (campground_id, vendor_site_id)
);
CREATE INDEX IF NOT EXISTS sites_campground_idx ON sites(campground_id);
CREATE INDEX IF NOT EXISTS sites_camp_map_idx  ON sites(camp_map_id);

CREATE TABLE IF NOT EXISTS site_type_labels (
  operator_id TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  icon_type   INTEGER NOT NULL,
  label       TEXT NOT NULL,
  PRIMARY KEY (operator_id, icon_type)
);

CREATE TABLE IF NOT EXISTS equipment_categories (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  operator_id                 TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  equipment_category_id       INTEGER NOT NULL,
  sub_equipment_category_id   INTEGER NOT NULL,
  name                        TEXT NOT NULL,
  order_index                 INTEGER NOT NULL DEFAULT 0,
  UNIQUE (operator_id, equipment_category_id, sub_equipment_category_id)
);
CREATE INDEX IF NOT EXISTS equipment_categories_operator_idx ON equipment_categories(operator_id);

-- Per-operator settings used by the availability fetch. Filled at metadata
-- ingest from /api/equipment + /api/bookingcategories. Lets the availability
-- script run without re-fetching these every time.
CREATE TABLE IF NOT EXISTS operator_fetch_config (
  operator_id                  TEXT PRIMARY KEY REFERENCES operators(id) ON DELETE CASCADE,
  campsite_booking_category_id INTEGER NOT NULL,
  equipment_category_id        INTEGER NOT NULL,
  sub_equipment_category_id    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS operator_attribute_definitions (
  operator_id             TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  attribute_definition_id INTEGER NOT NULL,
  display_name            TEXT NOT NULL,
  order_index             INTEGER NOT NULL DEFAULT 9999,
  attribute_type          INTEGER NOT NULL DEFAULT 0,
  is_filterable           INTEGER NOT NULL DEFAULT 0,
  is_disabled             INTEGER NOT NULL DEFAULT 0,
  is_multi_select         INTEGER NOT NULL DEFAULT 0,
  min_value               REAL,
  max_value               REAL,
  values                  TEXT NOT NULL DEFAULT '[]',
  source_raw              TEXT NOT NULL DEFAULT '{}',
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (operator_id, attribute_definition_id)
);
CREATE INDEX IF NOT EXISTS operator_attribute_definitions_name_idx
  ON operator_attribute_definitions(operator_id, display_name);

CREATE TABLE IF NOT EXISTS operator_rule_sources (
  operator_id   TEXT PRIMARY KEY REFERENCES operators(id) ON DELETE CASCADE,
  source_label  TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  alerts_url    TEXT,
  rules         TEXT NOT NULL DEFAULT '[]',
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Dynamic availability — refreshed by `npm run ingest:availability` ────

-- One row per (site, night) covering the operator's reservation window.
-- This is the source of truth for the calendar, search, analytics, and
-- everything that asks "is this site bookable on date X".
CREATE TABLE IF NOT EXISTS site_availability (
  site_id          TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  night_date       TEXT NOT NULL,
  status           TEXT NOT NULL,   -- 'available' | 'reserved' | 'closed' | 'unknown'
  last_checked_at  TEXT NOT NULL,
  PRIMARY KEY (site_id, night_date)
) WITHOUT ROWID;
-- Hot path: "show me available sites in this date range" — used by every
-- search query and the analytics aggregations.
CREATE INDEX IF NOT EXISTS site_availability_available_idx
  ON site_availability(site_id, status) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS site_availability_date_status_idx
  ON site_availability(night_date, status);

-- Tracks each refresh script run for observability and the data-freshness UI.
CREATE TABLE IF NOT EXISTS refresh_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  refresh_type    TEXT NOT NULL,   -- 'metadata' | 'availability'
  scope           TEXT,            -- operator_id, or NULL for all
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  status          TEXT NOT NULL,   -- 'running' | 'success' | 'partial' | 'failed'
  parks_seen      INTEGER NOT NULL DEFAULT 0,
  sites_seen      INTEGER NOT NULL DEFAULT 0,
  sites_updated   INTEGER NOT NULL DEFAULT 0,
  nights_updated  INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER,
  errors          TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS refresh_log_type_started_idx ON refresh_log(refresh_type, started_at DESC);

-- The last successful refresh per type, for fast "last updated X minutes ago"
-- queries without scanning refresh_log. Replaces the old snapshot_meta single-row.
CREATE TABLE IF NOT EXISTS refresh_meta (
  refresh_type    TEXT PRIMARY KEY,   -- 'metadata' | 'availability'
  last_success_at TEXT NOT NULL
);
