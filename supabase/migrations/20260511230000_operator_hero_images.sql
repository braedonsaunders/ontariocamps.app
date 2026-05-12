-- Hardcoded network hero images for the Parks > Networks cards.
--
-- Parks already carry a curated parks.hero_image_url. Operators need the same
-- treatment so network cards do not depend on whichever indexed park happens
-- to have a photo.

ALTER TABLE operators ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

UPDATE operators SET
  hero_image_url = 'https://ontarioconservationareas.ca/wp-content/uploads/2022/04/Fanshawe.jpg'
WHERE id = 'gtc_upperthames';

UPDATE operators SET
  hero_image_url = 'https://ontarioconservationareas.ca/wp-content/uploads/2022/04/CatfishCreek-Springwater.jpg'
WHERE id = 'gtc_catfish';

UPDATE operators SET
  hero_image_url = 'https://mvca.on.ca/wp-content/uploads/2025/01/scenic-Falls-and-blue-sky-with-clouds2024.jpg'
WHERE id = 'gtc_maitland';

-- Backfill park heroes too so the currently deployed /parks query, which
-- derives network photos from park photos, has something to render.
UPDATE parks SET
  hero_image_url = 'https://ontarioconservationareas.ca/wp-content/uploads/2022/04/Fanshawe.jpg'
WHERE operator_id = 'gtc_upperthames'
  AND name = 'Fanshawe'
  AND hero_image_url IS NULL;

UPDATE parks SET
  hero_image_url = 'https://ontarioconservationareas.ca/wp-content/uploads/2022/04/Wildwood.jpg'
WHERE operator_id = 'gtc_upperthames'
  AND name = 'Wildwood'
  AND hero_image_url IS NULL;

UPDATE parks SET
  hero_image_url = 'https://ontarioconservationareas.ca/wp-content/uploads/2022/04/Pittock.jpg'
WHERE operator_id = 'gtc_upperthames'
  AND name = 'Pittock'
  AND hero_image_url IS NULL;

UPDATE parks SET
  hero_image_url = 'https://ontarioconservationareas.ca/wp-content/uploads/2022/04/CatfishCreek-Springwater.jpg'
WHERE operator_id = 'gtc_catfish'
  AND name = 'Springwater Conservation Area'
  AND hero_image_url IS NULL;

UPDATE parks SET
  hero_image_url = 'https://mvca.on.ca/wp-content/uploads/2025/01/scenic-Falls-and-blue-sky-with-clouds2024.jpg'
WHERE operator_id = 'gtc_maitland'
  AND name = 'Falls Reserve'
  AND hero_image_url IS NULL;
