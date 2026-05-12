-- Smarter availability refresh target view.
--
-- The Worker uses these due-at columns to spend refresh budget where it matters:
-- near-term bookable inventory first, far-future and closed/grey inventory slower.

DROP VIEW IF EXISTS availability_fetch_targets;

CREATE VIEW availability_fetch_targets AS
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
),
site_due AS (
  SELECT *,
         CASE
           WHEN hot_sampled_nights = 0 THEN NULL
           WHEN hot_available_nights > 0 THEN hot_last_checked_at + interval '4 hours'
           WHEN hot_reserved_nights > 0 THEN hot_last_checked_at + interval '18 hours'
           ELSE hot_last_checked_at + interval '72 hours'
         END AS hot_due_at,
         CASE
           WHEN near_sampled_nights = 0 THEN NULL
           WHEN near_available_nights > 0 THEN near_last_checked_at + interval '18 hours'
           WHEN near_reserved_nights > 0 THEN near_last_checked_at + interval '48 hours'
           ELSE near_last_checked_at + interval '10 days'
         END AS near_due_at,
         CASE
           WHEN planning_sampled_nights = 0 THEN NULL
           WHEN planning_available_nights > 0 THEN planning_last_checked_at + interval '72 hours'
           WHEN planning_reserved_nights > 0 THEN planning_last_checked_at + interval '7 days'
           ELSE planning_last_checked_at + interval '30 days'
         END AS planning_due_at,
         CASE
           WHEN deep_sampled_nights = 0 THEN NULL
           WHEN deep_available_nights > 0 THEN deep_last_checked_at + interval '7 days'
           WHEN deep_reserved_nights > 0 THEN deep_last_checked_at + interval '21 days'
           ELSE deep_last_checked_at + interval '45 days'
         END AS deep_due_at
    FROM site_window_stats
)
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
       sd.hot_last_checked_at,
       sd.hot_due_at,
       sd.hot_available_nights,
       sd.hot_reserved_nights,
       sd.hot_sampled_nights,
       sd.near_last_checked_at,
       sd.near_due_at,
       sd.near_available_nights,
       sd.near_reserved_nights,
       sd.near_sampled_nights,
       sd.planning_last_checked_at,
       sd.planning_due_at,
       sd.planning_available_nights,
       sd.planning_reserved_nights,
       sd.planning_sampled_nights,
       sd.deep_last_checked_at,
       sd.deep_due_at,
       sd.deep_available_nights,
       sd.deep_reserved_nights,
       sd.deep_sampled_nights
  FROM sites s
  JOIN campgrounds c ON c.id = s.campground_id
  JOIN parks p ON p.id = c.park_id
  JOIN operators o ON o.id = p.operator_id
  JOIN operator_fetch_config ofc ON ofc.operator_id = o.id
  JOIN site_due sd ON sd.site_id = s.id
  LEFT JOIN site_availability today
         ON today.site_id = s.id
        AND today.night_date = CURRENT_DATE
 WHERE s.vendor_resource_location_id IS NOT NULL
   AND s.vendor_resource_id IS NOT NULL;

REVOKE ALL ON availability_fetch_targets FROM PUBLIC;
REVOKE ALL ON availability_fetch_targets FROM anon;
REVOKE ALL ON availability_fetch_targets FROM authenticated;
GRANT SELECT ON availability_fetch_targets TO service_role;
