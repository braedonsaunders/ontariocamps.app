-- Store refresh priority state so frequent Worker target selection stays cheap.
-- History in site_availability is preserved; this table only tracks future refresh scheduling.

CREATE TABLE IF NOT EXISTS availability_refresh_state (
  site_id TEXT PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  hot_last_checked_at TIMESTAMPTZ,
  hot_due_at TIMESTAMPTZ,
  hot_sampled_nights INTEGER NOT NULL DEFAULT 0,
  hot_available_nights INTEGER NOT NULL DEFAULT 0,
  hot_reserved_nights INTEGER NOT NULL DEFAULT 0,
  near_last_checked_at TIMESTAMPTZ,
  near_due_at TIMESTAMPTZ,
  near_sampled_nights INTEGER NOT NULL DEFAULT 0,
  near_available_nights INTEGER NOT NULL DEFAULT 0,
  near_reserved_nights INTEGER NOT NULL DEFAULT 0,
  planning_last_checked_at TIMESTAMPTZ,
  planning_due_at TIMESTAMPTZ,
  planning_sampled_nights INTEGER NOT NULL DEFAULT 0,
  planning_available_nights INTEGER NOT NULL DEFAULT 0,
  planning_reserved_nights INTEGER NOT NULL DEFAULT 0,
  deep_last_checked_at TIMESTAMPTZ,
  deep_due_at TIMESTAMPTZ,
  deep_sampled_nights INTEGER NOT NULL DEFAULT 0,
  deep_available_nights INTEGER NOT NULL DEFAULT 0,
  deep_reserved_nights INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS availability_refresh_state_hot_due_idx
  ON availability_refresh_state(hot_due_at, site_id);
CREATE INDEX IF NOT EXISTS availability_refresh_state_near_due_idx
  ON availability_refresh_state(near_due_at, site_id);
CREATE INDEX IF NOT EXISTS availability_refresh_state_planning_due_idx
  ON availability_refresh_state(planning_due_at, site_id);
CREATE INDEX IF NOT EXISTS availability_refresh_state_deep_due_idx
  ON availability_refresh_state(deep_due_at, site_id);

ALTER TABLE availability_refresh_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON availability_refresh_state FROM PUBLIC;
REVOKE ALL ON availability_refresh_state FROM anon;
REVOKE ALL ON availability_refresh_state FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON availability_refresh_state TO service_role;

WITH site_window_stats AS (
  SELECT s.id AS site_id,
         min(sa.last_checked_at) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2
         ) AS hot_last_checked_at,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2
         )::int AS hot_sampled_nights,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2
             AND sa.status = 'available'
         )::int AS hot_available_nights,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2
             AND sa.status = 'reserved'
         )::int AS hot_reserved_nights,
         min(sa.last_checked_at) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 3 AND CURRENT_DATE + 13
         ) AS near_last_checked_at,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 3 AND CURRENT_DATE + 13
         )::int AS near_sampled_nights,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 3 AND CURRENT_DATE + 13
             AND sa.status = 'available'
         )::int AS near_available_nights,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 3 AND CURRENT_DATE + 13
             AND sa.status = 'reserved'
         )::int AS near_reserved_nights,
         min(sa.last_checked_at) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 14 AND CURRENT_DATE + 89
         ) AS planning_last_checked_at,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 14 AND CURRENT_DATE + 89
         )::int AS planning_sampled_nights,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 14 AND CURRENT_DATE + 89
             AND sa.status = 'available'
         )::int AS planning_available_nights,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 14 AND CURRENT_DATE + 89
             AND sa.status = 'reserved'
         )::int AS planning_reserved_nights,
         min(sa.last_checked_at) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 90 AND CURRENT_DATE + 179
         ) AS deep_last_checked_at,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 90 AND CURRENT_DATE + 179
         )::int AS deep_sampled_nights,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 90 AND CURRENT_DATE + 179
             AND sa.status = 'available'
         )::int AS deep_available_nights,
         count(*) FILTER (
           WHERE sa.night_date BETWEEN CURRENT_DATE + 90 AND CURRENT_DATE + 179
             AND sa.status = 'reserved'
         )::int AS deep_reserved_nights
    FROM sites s
    LEFT JOIN site_availability sa
           ON sa.site_id = s.id
          AND sa.night_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 179
   GROUP BY s.id
)
INSERT INTO availability_refresh_state (
  site_id,
  hot_last_checked_at, hot_due_at, hot_sampled_nights, hot_available_nights, hot_reserved_nights,
  near_last_checked_at, near_due_at, near_sampled_nights, near_available_nights, near_reserved_nights,
  planning_last_checked_at, planning_due_at, planning_sampled_nights, planning_available_nights, planning_reserved_nights,
  deep_last_checked_at, deep_due_at, deep_sampled_nights, deep_available_nights, deep_reserved_nights,
  updated_at
)
SELECT site_id,
       hot_last_checked_at,
       CASE
         WHEN hot_sampled_nights = 0 THEN NULL
         WHEN hot_available_nights > 0 THEN hot_last_checked_at + interval '4 hours'
         WHEN hot_reserved_nights > 0 THEN hot_last_checked_at + interval '18 hours'
         ELSE hot_last_checked_at + interval '72 hours'
       END,
       hot_sampled_nights, hot_available_nights, hot_reserved_nights,
       near_last_checked_at,
       CASE
         WHEN near_sampled_nights = 0 THEN NULL
         WHEN near_available_nights > 0 THEN near_last_checked_at + interval '18 hours'
         WHEN near_reserved_nights > 0 THEN near_last_checked_at + interval '48 hours'
         ELSE near_last_checked_at + interval '10 days'
       END,
       near_sampled_nights, near_available_nights, near_reserved_nights,
       planning_last_checked_at,
       CASE
         WHEN planning_sampled_nights = 0 THEN NULL
         WHEN planning_available_nights > 0 THEN planning_last_checked_at + interval '72 hours'
         WHEN planning_reserved_nights > 0 THEN planning_last_checked_at + interval '7 days'
         ELSE planning_last_checked_at + interval '30 days'
       END,
       planning_sampled_nights, planning_available_nights, planning_reserved_nights,
       deep_last_checked_at,
       CASE
         WHEN deep_sampled_nights = 0 THEN NULL
         WHEN deep_available_nights > 0 THEN deep_last_checked_at + interval '7 days'
         WHEN deep_reserved_nights > 0 THEN deep_last_checked_at + interval '21 days'
         ELSE deep_last_checked_at + interval '45 days'
       END,
       deep_sampled_nights, deep_available_nights, deep_reserved_nights,
       now()
  FROM site_window_stats
ON CONFLICT (site_id) DO UPDATE SET
  hot_last_checked_at = excluded.hot_last_checked_at,
  hot_due_at = excluded.hot_due_at,
  hot_sampled_nights = excluded.hot_sampled_nights,
  hot_available_nights = excluded.hot_available_nights,
  hot_reserved_nights = excluded.hot_reserved_nights,
  near_last_checked_at = excluded.near_last_checked_at,
  near_due_at = excluded.near_due_at,
  near_sampled_nights = excluded.near_sampled_nights,
  near_available_nights = excluded.near_available_nights,
  near_reserved_nights = excluded.near_reserved_nights,
  planning_last_checked_at = excluded.planning_last_checked_at,
  planning_due_at = excluded.planning_due_at,
  planning_sampled_nights = excluded.planning_sampled_nights,
  planning_available_nights = excluded.planning_available_nights,
  planning_reserved_nights = excluded.planning_reserved_nights,
  deep_last_checked_at = excluded.deep_last_checked_at,
  deep_due_at = excluded.deep_due_at,
  deep_sampled_nights = excluded.deep_sampled_nights,
  deep_available_nights = excluded.deep_available_nights,
  deep_reserved_nights = excluded.deep_reserved_nights,
  updated_at = excluded.updated_at;

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
       today.last_checked_at AS today_last_checked_at,
       ars.hot_last_checked_at,
       ars.hot_due_at,
       ars.hot_available_nights,
       ars.hot_reserved_nights,
       ars.hot_sampled_nights,
       ars.near_last_checked_at,
       ars.near_due_at,
       ars.near_available_nights,
       ars.near_reserved_nights,
       ars.near_sampled_nights,
       ars.planning_last_checked_at,
       ars.planning_due_at,
       ars.planning_available_nights,
       ars.planning_reserved_nights,
       ars.planning_sampled_nights,
       ars.deep_last_checked_at,
       ars.deep_due_at,
       ars.deep_available_nights,
       ars.deep_reserved_nights,
       ars.deep_sampled_nights
  FROM sites s
  JOIN campgrounds c ON c.id = s.campground_id
  JOIN parks p ON p.id = c.park_id
  JOIN operators o ON o.id = p.operator_id
  JOIN operator_fetch_config ofc ON ofc.operator_id = o.id
  LEFT JOIN availability_refresh_state ars ON ars.site_id = s.id
  LEFT JOIN site_availability today
         ON today.site_id = s.id
        AND today.night_date = CURRENT_DATE
 WHERE s.vendor_resource_location_id IS NOT NULL
   AND s.vendor_resource_id IS NOT NULL;

REVOKE ALL ON availability_fetch_targets FROM PUBLIC;
REVOKE ALL ON availability_fetch_targets FROM anon;
REVOKE ALL ON availability_fetch_targets FROM authenticated;
GRANT SELECT ON availability_fetch_targets TO service_role;
