-- ontariocamps.app — initial schema (Postgres / Supabase)
-- Mirrors the SQLite dev schema but uses Postgres-native types:
--   INTEGER booleans → BOOLEAN
--   `WITHOUT ROWID` dropped (Postgres has built-in clustered indexes)
--   AUTOINCREMENT → BIGSERIAL
--   Geo column added via PostGIS for ST_DWithin searches in production

CREATE EXTENSION IF NOT EXISTS postgis;

-- ─── Static metadata ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS operators (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  vendor       TEXT NOT NULL,
  base_url     TEXT NOT NULL,
  booking_url  TEXT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS parks (
  id             TEXT PRIMARY KEY,
  operator_id    TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  vendor_park_id TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT,
  region         TEXT,
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  -- PostGIS geography for fast radius queries: ST_DWithin(location, ST_MakePoint(lng,lat)::geography, radius_m)
  location       GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
  address        TEXT,
  hero_image_url TEXT,
  vendor_url     TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operator_id, vendor_park_id)
);
CREATE INDEX IF NOT EXISTS parks_operator_idx ON parks(operator_id);
CREATE INDEX IF NOT EXISTS parks_location_gix ON parks USING gist (location);

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
  id                          TEXT PRIMARY KEY,
  campground_id               TEXT NOT NULL REFERENCES campgrounds(id) ON DELETE CASCADE,
  vendor_site_id              TEXT NOT NULL,
  name                        TEXT NOT NULL,
  site_type                   TEXT NOT NULL,
  site_type_label             TEXT,
  icon_type                   INTEGER,
  max_party_size              INTEGER NOT NULL,
  max_equipment_length_ft     INTEGER,
  has_electric                BOOLEAN NOT NULL DEFAULT FALSE,
  has_water                   BOOLEAN NOT NULL DEFAULT FALSE,
  has_sewer                   BOOLEAN NOT NULL DEFAULT FALSE,
  is_pull_through             BOOLEAN NOT NULL DEFAULT FALSE,
  is_accessible               BOOLEAN NOT NULL DEFAULT FALSE,
  is_pet_friendly             BOOLEAN NOT NULL DEFAULT TRUE,
  is_waterfront               BOOLEAN NOT NULL DEFAULT FALSE,
  amenities                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  camp_map_id                 TEXT REFERENCES camp_maps(id),
  map_x                       INTEGER,
  map_y                       INTEGER,
  vendor_resource_location_id BIGINT,
  vendor_resource_id          BIGINT,
  vendor_booking_category_id  INTEGER,
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
  id                          BIGSERIAL PRIMARY KEY,
  operator_id                 TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  equipment_category_id       INTEGER NOT NULL,
  sub_equipment_category_id   INTEGER NOT NULL,
  name                        TEXT NOT NULL,
  order_index                 INTEGER NOT NULL DEFAULT 0,
  UNIQUE (operator_id, equipment_category_id, sub_equipment_category_id)
);
CREATE INDEX IF NOT EXISTS equipment_categories_operator_idx ON equipment_categories(operator_id);

CREATE TABLE IF NOT EXISTS operator_fetch_config (
  operator_id                  TEXT PRIMARY KEY REFERENCES operators(id) ON DELETE CASCADE,
  campsite_booking_category_id INTEGER NOT NULL,
  equipment_category_id        INTEGER NOT NULL,
  sub_equipment_category_id    INTEGER NOT NULL
);

-- ─── Dynamic availability ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_availability (
  site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  night_date      DATE NOT NULL,
  status          TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (site_id, night_date)
);
CREATE INDEX IF NOT EXISTS site_availability_available_idx
  ON site_availability(site_id) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS site_availability_date_status_idx
  ON site_availability(night_date, status);

-- ─── Observability ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_log (
  id             BIGSERIAL PRIMARY KEY,
  refresh_type   TEXT NOT NULL,
  scope          TEXT,
  started_at     TIMESTAMPTZ NOT NULL,
  finished_at    TIMESTAMPTZ,
  status         TEXT NOT NULL,
  parks_seen     INTEGER NOT NULL DEFAULT 0,
  sites_seen     INTEGER NOT NULL DEFAULT 0,
  sites_updated  INTEGER NOT NULL DEFAULT 0,
  nights_updated INTEGER NOT NULL DEFAULT 0,
  duration_ms    INTEGER,
  errors         JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS refresh_log_type_started_idx ON refresh_log(refresh_type, started_at DESC);

CREATE TABLE IF NOT EXISTS refresh_meta (
  refresh_type    TEXT PRIMARY KEY,
  last_success_at TIMESTAMPTZ NOT NULL
);

-- ─── Row Level Security ──────────────────────────────────────────────────
-- All tables get RLS enabled with read-only anon access. The ingest scripts
-- connect as the postgres role (service_role bypasses RLS).

ALTER TABLE operators              ENABLE ROW LEVEL SECURITY;
ALTER TABLE parks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campgrounds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_maps              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_type_labels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_fetch_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_availability      ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_meta           ENABLE ROW LEVEL SECURITY;

-- Anonymous read on every public table. operator_fetch_config is internal.
CREATE POLICY "public read" ON operators             FOR SELECT USING (true);
CREATE POLICY "public read" ON parks                 FOR SELECT USING (true);
CREATE POLICY "public read" ON campgrounds           FOR SELECT USING (true);
CREATE POLICY "public read" ON camp_maps             FOR SELECT USING (true);
CREATE POLICY "public read" ON sites                 FOR SELECT USING (true);
CREATE POLICY "public read" ON site_type_labels      FOR SELECT USING (true);
CREATE POLICY "public read" ON equipment_categories  FOR SELECT USING (true);
CREATE POLICY "public read" ON site_availability     FOR SELECT USING (true);
CREATE POLICY "public read" ON refresh_log           FOR SELECT USING (true);
CREATE POLICY "public read" ON refresh_meta          FOR SELECT USING (true);
-- operator_fetch_config: no anon read (contains internal Camis IDs we use only server-side)
