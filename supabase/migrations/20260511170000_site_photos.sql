-- Per-site photos + description, sourced from CAMIS's
-- /api/resourcelocation/resources endpoint. Each site can have multiple
-- photos (Camis stores them in `photos[].photoUrlResult.{url,avifUrl}` along
-- with an aspectType). We store the full array as JSONB so the UI can render
-- a gallery without an extra round-trip.
--
-- `description` carries the operator's free-text blurb (e.g. "Could accommodate
-- trailers up to 23 ft."); previously only the *map-section* description was
-- stored — this is per-site.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS photos      JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS description TEXT;

-- Index to count sites with photos quickly; we don't query by photo content,
-- just by "has any photos" so a partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS sites_with_photos_idx ON sites ((jsonb_array_length(photos))) WHERE jsonb_array_length(photos) > 0;
