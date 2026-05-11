-- Public, community-submitted reviews for individual campsites.
--
-- Schema for v1 — minimal but extensible:
--   - site_id is the FK; one site has many reviews.
--   - rating is an integer 1..5; we don't enforce a sub-aspect taxonomy yet
--     (privacy, shade, etc.) — those land in a follow-up as additional NULL
--     columns when we know what people actually rate.
--   - author_handle is freeform but limited; we don't require accounts at v1.
--     If/when we add auth, an `author_id uuid REFERENCES auth.users(id)` will
--     join this table.
--   - status tracks moderation state. Default is `pending` so an admin (or an
--     AI moderation pass) approves a review before it shows publicly. The
--     public read policy below only exposes `approved` rows.

CREATE TYPE site_review_status AS ENUM ('pending', 'approved', 'rejected', 'flagged');

CREATE TABLE IF NOT EXISTS site_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  author_handle   TEXT NOT NULL CHECK (char_length(author_handle) BETWEEN 2 AND 40),
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title           TEXT CHECK (title IS NULL OR char_length(title) <= 120),
  body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  visited_at      DATE,
  status          site_review_status NOT NULL DEFAULT 'pending',
  -- For abuse-rate-limiting; we hash the client's IP rather than storing it.
  submitter_hash  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS site_reviews_site_idx     ON site_reviews(site_id);
CREATE INDEX IF NOT EXISTS site_reviews_status_idx   ON site_reviews(status);
CREATE INDEX IF NOT EXISTS site_reviews_approved_idx ON site_reviews(site_id, created_at DESC) WHERE status = 'approved';

ALTER TABLE site_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved reviews.
CREATE POLICY "public read approved" ON site_reviews
  FOR SELECT
  USING (status = 'approved');

-- Anonymous submission is allowed: anyone can INSERT a pending review.
-- A row inserted as anything other than 'pending' is rejected.
CREATE POLICY "public insert pending" ON site_reviews
  FOR INSERT
  WITH CHECK (status = 'pending');

-- Denormalised aggregates on sites — keeps the popover/site-card rendering
-- to a single SELECT with no join. Refreshed when reviews are approved or
-- deleted via the trigger below.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS review_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rating_avg    NUMERIC(3,2);

CREATE OR REPLACE FUNCTION refresh_site_review_stats(p_site_id TEXT) RETURNS void AS $$
BEGIN
  UPDATE sites
     SET review_count = COALESCE((SELECT count(*)::int FROM site_reviews
                                    WHERE site_id = p_site_id AND status = 'approved'), 0),
         rating_avg   = (SELECT round(avg(rating)::numeric, 2) FROM site_reviews
                          WHERE site_id = p_site_id AND status = 'approved')
   WHERE id = p_site_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_site_review_stats() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM refresh_site_review_stats(OLD.site_id);
    RETURN OLD;
  END IF;
  -- INSERT or UPDATE: only act if the row is or was 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved')
     OR (TG_OP = 'UPDATE' AND (NEW.status = 'approved' OR OLD.status = 'approved')) THEN
    PERFORM refresh_site_review_stats(NEW.site_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_review_stats ON site_reviews;
CREATE TRIGGER trg_site_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON site_reviews
  FOR EACH ROW EXECUTE FUNCTION trg_site_review_stats();
