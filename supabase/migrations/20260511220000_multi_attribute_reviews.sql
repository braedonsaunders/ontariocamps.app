-- Multi-attribute review system for parks and campsites.
--
-- Replaces the single-rating site_reviews table with:
--   1. site_reviews  — per-campsite reviews with sub-ratings
--   2. park_reviews  — per-park reviews with sub-ratings
--
-- Sub-rating attributes (both tables):
--   - overall    1-5  (required)
--   - privacy    1-5  (how private / spaced out from neighbours)
--   - cleanliness 1-5 (cleanliness of site / facilities)
--   - noise      1-5  (how quiet / peaceful)
--   - site_size  1-5  (how spacious the site is)
--   - shade      1-5  (tree cover / shade quality)
--
-- Park-specific attributes (park_reviews only):
--   - facilities 1-5  (washrooms, showers, playground, etc.)
--   - trails    1-5   (hiking trail quality and variety)
--   - beach     1-5   (water access / beach quality)
--
-- Auth: anonymous v1. author_handle is freeform; submitter_hash for rate-limiting.
-- Moderation: status defaults to 'approved' for immediate visibility, can be flagged.

-- ─── Drop old single-rating objects ──────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_site_review_stats ON site_reviews;
DROP FUNCTION IF EXISTS trg_site_review_stats();
DROP FUNCTION IF EXISTS refresh_site_review_stats(TEXT);
DROP TYPE IF EXISTS site_review_status;
DROP TABLE IF EXISTS site_reviews;

-- ─── Shared enum ─────────────────────────────────────────────────────────────

CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected', 'flagged');

-- ─── Site Reviews ────────────────────────────────────────────────────────────

CREATE TABLE site_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  author_handle   TEXT NOT NULL CHECK (char_length(author_handle) BETWEEN 2 AND 40),
  overall         SMALLINT NOT NULL CHECK (overall BETWEEN 1 AND 5),
  privacy         SMALLINT CHECK (privacy BETWEEN 1 AND 5),
  cleanliness     SMALLINT CHECK (cleanliness BETWEEN 1 AND 5),
  noise           SMALLINT CHECK (noise BETWEEN 1 AND 5),
  site_size       SMALLINT CHECK (site_size BETWEEN 1 AND 5),
  shade           SMALLINT CHECK (shade BETWEEN 1 AND 5),
  title           TEXT CHECK (title IS NULL OR char_length(title) <= 120),
  body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  visited_at      DATE,
  status          review_status NOT NULL DEFAULT 'approved',
  submitter_hash  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX site_reviews_site_idx      ON site_reviews(site_id);
CREATE INDEX site_reviews_status_idx    ON site_reviews(status);
CREATE INDEX site_reviews_approved_idx  ON site_reviews(site_id, created_at DESC) WHERE status = 'approved';
CREATE INDEX site_reviews_submitter_idx ON site_reviews(submitter_hash) WHERE submitter_hash IS NOT NULL;

ALTER TABLE site_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read approved site reviews" ON site_reviews
  FOR SELECT USING (status = 'approved');

CREATE POLICY "public insert site review" ON site_reviews
  FOR INSERT WITH CHECK (status IN ('pending', 'approved'));

-- ─── Park Reviews ────────────────────────────────────────────────────────────

CREATE TABLE park_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  park_id         TEXT NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
  author_handle   TEXT NOT NULL CHECK (char_length(author_handle) BETWEEN 2 AND 40),
  overall         SMALLINT NOT NULL CHECK (overall BETWEEN 1 AND 5),
  facilities      SMALLINT CHECK (facilities BETWEEN 1 AND 5),
  trails          SMALLINT CHECK (trails BETWEEN 1 AND 5),
  beach           SMALLINT CHECK (beach BETWEEN 1 AND 5),
  privacy         SMALLINT CHECK (privacy BETWEEN 1 AND 5),
  noise           SMALLINT CHECK (noise BETWEEN 1 AND 5),
  title           TEXT CHECK (title IS NULL OR char_length(title) <= 120),
  body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  visited_at      DATE,
  status          review_status NOT NULL DEFAULT 'approved',
  submitter_hash  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX park_reviews_park_idx       ON park_reviews(park_id);
CREATE INDEX park_reviews_status_idx     ON park_reviews(status);
CREATE INDEX park_reviews_approved_idx   ON park_reviews(park_id, created_at DESC) WHERE status = 'approved';
CREATE INDEX park_reviews_submitter_idx  ON park_reviews(submitter_hash) WHERE submitter_hash IS NOT NULL;

ALTER TABLE park_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read approved park reviews" ON park_reviews
  FOR SELECT USING (status = 'approved');

CREATE POLICY "public insert park review" ON park_reviews
  FOR INSERT WITH CHECK (status IN ('pending', 'approved'));

-- ─── Denormalized aggregates ─────────────────────────────────────────────────

-- Sites: review_count and rating_avg already exist from original migration;
-- add sub-rating averages.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS review_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rating_avg      NUMERIC(3,2);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rating_privacy   NUMERIC(3,2);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rating_cleanliness NUMERIC(3,2);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rating_noise     NUMERIC(3,2);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rating_site_size NUMERIC(3,2);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rating_shade     NUMERIC(3,2);

-- Parks: add review aggregates.
ALTER TABLE parks ADD COLUMN IF NOT EXISTS review_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE parks ADD COLUMN IF NOT EXISTS rating_avg         NUMERIC(3,2);
ALTER TABLE parks ADD COLUMN IF NOT EXISTS rating_facilities  NUMERIC(3,2);
ALTER TABLE parks ADD COLUMN IF NOT EXISTS rating_trails      NUMERIC(3,2);
ALTER TABLE parks ADD COLUMN IF NOT EXISTS rating_beach       NUMERIC(3,2);
ALTER TABLE parks ADD COLUMN IF NOT EXISTS rating_privacy     NUMERIC(3,2);
ALTER TABLE parks ADD COLUMN IF NOT EXISTS rating_noise       NUMERIC(3,2);

-- ─── Refresh functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_site_review_stats(p_site_id TEXT) RETURNS void AS $$
BEGIN
  UPDATE sites SET
    review_count       = COALESCE((SELECT count(*)::int FROM site_reviews WHERE site_id = p_site_id AND status = 'approved'), 0),
    rating_avg         = (SELECT round(avg(overall)::numeric, 2)      FROM site_reviews WHERE site_id = p_site_id AND status = 'approved'),
    rating_privacy     = (SELECT round(avg(privacy)::numeric, 2)      FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND privacy IS NOT NULL),
    rating_cleanliness = (SELECT round(avg(cleanliness)::numeric, 2)  FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND cleanliness IS NOT NULL),
    rating_noise       = (SELECT round(avg(noise)::numeric, 2)        FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND noise IS NOT NULL),
    rating_site_size   = (SELECT round(avg(site_size)::numeric, 2)    FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND site_size IS NOT NULL),
    rating_shade       = (SELECT round(avg(shade)::numeric, 2)        FROM site_reviews WHERE site_id = p_site_id AND status = 'approved' AND shade IS NOT NULL)
  WHERE id = p_site_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_park_review_stats(p_park_id TEXT) RETURNS void AS $$
BEGIN
  UPDATE parks SET
    review_count      = COALESCE((SELECT count(*)::int FROM park_reviews WHERE park_id = p_park_id AND status = 'approved'), 0),
    rating_avg        = (SELECT round(avg(overall)::numeric, 2)   FROM park_reviews WHERE park_id = p_park_id AND status = 'approved'),
    rating_facilities = (SELECT round(avg(facilities)::numeric, 2) FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND facilities IS NOT NULL),
    rating_trails     = (SELECT round(avg(trails)::numeric, 2)     FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND trails IS NOT NULL),
    rating_beach      = (SELECT round(avg(beach)::numeric, 2)      FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND beach IS NOT NULL),
    rating_privacy    = (SELECT round(avg(privacy)::numeric, 2)    FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND privacy IS NOT NULL),
    rating_noise      = (SELECT round(avg(noise)::numeric, 2)      FROM park_reviews WHERE park_id = p_park_id AND status = 'approved' AND noise IS NOT NULL)
  WHERE id = p_park_id;
END;
$$ LANGUAGE plpgsql;

-- ─── Triggers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_site_review_stats() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_site_review_stats(OLD.site_id);
    RETURN OLD;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND (NEW.status = 'approved' OR OLD.status = 'approved')) THEN
    PERFORM refresh_site_review_stats(NEW.site_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_site_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON site_reviews
  FOR EACH ROW EXECUTE FUNCTION trg_site_review_stats();

CREATE OR REPLACE FUNCTION trg_park_review_stats() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_park_review_stats(OLD.park_id);
    RETURN OLD;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND (NEW.status = 'approved' OR OLD.status = 'approved')) THEN
    PERFORM refresh_park_review_stats(NEW.park_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_park_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON park_reviews
  FOR EACH ROW EXECUTE FUNCTION trg_park_review_stats();
