-- camp_maps.description holds the operator's site-range subtitle for a section
-- ("Sites 1-23", "Walk-in tents", etc.). The metadata ingest pulls this from
-- the CAMIS map's `localizedValues[].description` field.
ALTER TABLE camp_maps ADD COLUMN IF NOT EXISTS description TEXT;
