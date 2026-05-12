-- Supabase-native refresh plumbing.
--
-- NOTE: CAMIS/GoingToCamp currently returns immediate 403s from Supabase Edge
-- egress, so the vendor-fetching Edge Function is deployed but not scheduled
-- here. Keep the database-side rollup refresh autonomous; run vendor fetches
-- from an allowlisted/residential worker or an official integration.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.scheduler_secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE private.scheduler_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.scheduler_secrets FROM PUBLIC;

DROP VIEW IF EXISTS availability_fetch_targets;

CREATE VIEW availability_fetch_targets AS
SELECT s.id AS site_id,
       p.id AS park_id,
       p.slug AS park_slug,
       s.vendor_resource_location_id,
       s.vendor_resource_id,
       s.vendor_booking_category_id,
       o.id AS operator_id,
       o.base_url AS operator_base_url,
       ofc.equipment_category_id,
       ofc.sub_equipment_category_id,
       today.last_checked_at AS today_last_checked_at
  FROM sites s
  JOIN campgrounds c ON c.id = s.campground_id
  JOIN parks p ON p.id = c.park_id
  JOIN operators o ON o.id = p.operator_id
  JOIN operator_fetch_config ofc ON ofc.operator_id = o.id
  LEFT JOIN site_availability today
         ON today.site_id = s.id
        AND today.night_date = CURRENT_DATE
 WHERE s.vendor_resource_location_id IS NOT NULL
   AND s.vendor_resource_id IS NOT NULL
 ORDER BY s.id;

GRANT SELECT ON availability_fetch_targets TO service_role;

CREATE OR REPLACE FUNCTION invoke_availability_refresh(payload JSONB)
RETURNS BIGINT AS $$
DECLARE
  request_id BIGINT;
  project_url TEXT;
  refresh_key TEXT;
BEGIN
  SELECT value INTO project_url FROM private.scheduler_secrets WHERE name = 'project_url';
  SELECT value INTO refresh_key FROM private.scheduler_secrets WHERE name = 'refresh_api_key';

  IF project_url IS NULL OR refresh_key IS NULL THEN
    RAISE EXCEPTION 'Scheduler secrets are not configured';
  END IF;

  SELECT net.http_post(
    url := project_url || '/functions/v1/refresh-availability',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-key', refresh_key
    ),
    body := payload,
    timeout_milliseconds := 5000
  ) INTO request_id;

  RETURN request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION invoke_availability_refresh(JSONB) FROM PUBLIC;

SELECT cron.unschedule(jobname)
  FROM cron.job
 WHERE jobname IN (
   'availability-refresh-hot-shard-0',
   'availability-refresh-hot-shard-1',
   'availability-refresh-hot-shard-2',
   'availability-refresh-hot-shard-3',
   'availability-refresh-hot-shard-4',
   'availability-refresh-hot-shard-5',
   'availability-refresh-full-horizon',
   'availability-refresh-hot-batch',
   'availability-refresh-full-batch',
   'availability-refresh-rollups'
 );

SELECT cron.schedule(
  'availability-refresh-rollups',
  '*/5 * * * *',
  $$SELECT refresh_rollups();$$
);
