-- Security hardening for public app endpoints and Supabase REST exposure.

CREATE TABLE IF NOT EXISTS app_rate_limit_events (
  id         BIGSERIAL PRIMARY KEY,
  action     TEXT NOT NULL,
  rate_key   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_rate_limit_events_lookup_idx
  ON app_rate_limit_events(action, rate_key, created_at DESC);

ALTER TABLE app_rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_rate_limit_events FROM PUBLIC;
REVOKE ALL ON app_rate_limit_events FROM anon;
REVOKE ALL ON app_rate_limit_events FROM authenticated;

-- Public users should submit reviews through the Next.js API, where we can
-- enforce origin, body size, validation, and rate limits before writing.
DROP POLICY IF EXISTS "public insert site review" ON site_reviews;
DROP POLICY IF EXISTS "public insert park review" ON park_reviews;

-- Detailed refresh logs may contain operational error detail. Keep the compact
-- refresh_meta table public for freshness UI, but hide raw logs from anon REST.
DROP POLICY IF EXISTS "public read" ON refresh_log;
REVOKE SELECT ON refresh_log FROM anon;
REVOKE SELECT ON refresh_log FROM authenticated;

-- Worker fetch targets contain vendor IDs and should only be readable with the
-- service-role key used by trusted automation.
REVOKE ALL ON availability_fetch_targets FROM PUBLIC;
REVOKE ALL ON availability_fetch_targets FROM anon;
REVOKE ALL ON availability_fetch_targets FROM authenticated;
GRANT SELECT ON availability_fetch_targets TO service_role;
