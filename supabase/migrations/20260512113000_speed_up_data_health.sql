-- Speed up /data health reads and keep refresh-state rows complete.

CREATE INDEX IF NOT EXISTS site_availability_date_site_health_idx
  ON site_availability (night_date, site_id)
  INCLUDE (status, last_checked_at);

WITH missing_sites AS (
  SELECT s.id AS site_id
    FROM sites s
    LEFT JOIN availability_refresh_state ars ON ars.site_id = s.id
   WHERE ars.site_id IS NULL
),
site_window_stats AS (
  SELECT ms.site_id,
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
    FROM missing_sites ms
    LEFT JOIN site_availability sa
           ON sa.site_id = ms.site_id
          AND sa.night_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 179
   GROUP BY ms.site_id
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
ON CONFLICT (site_id) DO NOTHING;
