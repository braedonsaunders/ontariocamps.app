-- camp_maps.features holds non-site point-of-interest data from the CAMIS map
-- payload: mapLegendItems (washrooms, water taps, etc.) and mapLabels (text
-- labels). Each entry is `{ kind, x, y, r, g, b, ... }`. Stored as JSONB so
-- the schema can absorb optional fields per kind without DB migrations.
--
-- Why a column on camp_maps instead of a child table: there are tens of
-- features per map and we always read them alongside the rest of the map row,
-- so embedding keeps reads to one SELECT.

ALTER TABLE camp_maps ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb;
