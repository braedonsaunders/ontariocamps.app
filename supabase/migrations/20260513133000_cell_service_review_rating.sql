-- Add camper-reported cell service quality as a 1-5 review sub-rating.
-- This is deliberately user-reported: official coverage layers are useful
-- context, but campsite signal depends on carrier, terrain, foliage, and load.

ALTER TABLE site_reviews
  ADD COLUMN IF NOT EXISTS cell_service SMALLINT CHECK (cell_service BETWEEN 1 AND 5);

ALTER TABLE park_reviews
  ADD COLUMN IF NOT EXISTS cell_service SMALLINT CHECK (cell_service BETWEEN 1 AND 5);

ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS rating_cell_service NUMERIC(3,2);

ALTER TABLE parks
  ADD COLUMN IF NOT EXISTS rating_cell_service NUMERIC(3,2);

CREATE OR REPLACE FUNCTION refresh_site_review_stats(p_site_id TEXT) RETURNS void AS $$
BEGIN
  UPDATE sites SET
    review_count          = COALESCE((SELECT count(*)::int FROM site_reviews WHERE site_id = p_site_id AND status = 'approved'), 0),
    rating_avg            = (SELECT round(avg(overall)::numeric, 2)      FROM site_reviews WHERE site_id = p_site_id AND status = 'approved'),
    rating_privacy        = (SELECT round(avg(privacy)::numeric, 2)      FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND privacy IS NOT NULL),
    rating_cleanliness    = (SELECT round(avg(cleanliness)::numeric, 2)  FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND cleanliness IS NOT NULL),
    rating_noise          = (SELECT round(avg(noise)::numeric, 2)        FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND noise IS NOT NULL),
    rating_site_size      = (SELECT round(avg(site_size)::numeric, 2)    FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND site_size IS NOT NULL),
    rating_shade          = (SELECT round(avg(shade)::numeric, 2)        FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND shade IS NOT NULL),
    rating_cell_service   = (SELECT round(avg(cell_service)::numeric, 2) FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND cell_service IS NOT NULL)
  WHERE id = p_site_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_park_review_stats(p_park_id TEXT) RETURNS void AS $$
BEGIN
  UPDATE parks SET
    review_count          = COALESCE((SELECT count(*)::int FROM park_reviews WHERE park_id = p_park_id AND status = 'approved'), 0),
    rating_avg            = (SELECT round(avg(overall)::numeric, 2)       FROM park_reviews WHERE park_id = p_park_id AND status = 'approved'),
    rating_facilities     = (SELECT round(avg(facilities)::numeric, 2)    FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND facilities IS NOT NULL),
    rating_trails         = (SELECT round(avg(trails)::numeric, 2)        FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND trails IS NOT NULL),
    rating_beach          = (SELECT round(avg(beach)::numeric, 2)         FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND beach IS NOT NULL),
    rating_privacy        = (SELECT round(avg(privacy)::numeric, 2)       FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND privacy IS NOT NULL),
    rating_noise          = (SELECT round(avg(noise)::numeric, 2)         FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND noise IS NOT NULL),
    rating_cell_service   = (SELECT round(avg(cell_service)::numeric, 2)  FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND cell_service IS NOT NULL)
  WHERE id = p_park_id;
END;
$$ LANGUAGE plpgsql;
