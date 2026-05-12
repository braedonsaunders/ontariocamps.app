-- Fair scheduled target selection for the Cloudflare availability Worker.
--
-- The hot queue is much larger for Ontario Parks than for the other operators.
-- Interleaving by operator keeps small networks lively while still spending
-- most cron slots on the oldest due work.

CREATE OR REPLACE FUNCTION claim_availability_refresh_targets(p_window TEXT, p_limit INTEGER)
RETURNS TABLE (
  site_id TEXT,
  park_id TEXT,
  park_slug TEXT,
  vendor_resource_location_id BIGINT,
  vendor_resource_id BIGINT,
  vendor_booking_category_id INTEGER,
  operator_id TEXT,
  operator_base_url TEXT,
  equipment_category_id INTEGER,
  sub_equipment_category_id INTEGER,
  today_last_checked_at TIMESTAMPTZ,
  hot_due_at TIMESTAMPTZ,
  near_due_at TIMESTAMPTZ,
  planning_due_at TIMESTAMPTZ,
  deep_due_at TIMESTAMPTZ
) AS $$
  WITH args AS (
    SELECT CASE
             WHEN p_window IN ('hot', 'near', 'planning', 'deep') THEN p_window
             ELSE 'hot'
           END AS window_name,
           LEAST(GREATEST(COALESCE(p_limit, 0), 0), 1000) AS target_limit
  ),
  ranked AS (
    SELECT picked.*,
           row_number() OVER (
             PARTITION BY operator_id
             ORDER BY
               CASE
                 WHEN available_nights > 0 THEN 0
                 WHEN sampled_nights = 0 THEN 1
                 ELSE 2
               END,
               due_at ASC NULLS FIRST,
               site_id ASC
           ) AS operator_rank
      FROM operators operator_queue
      CROSS JOIN args
      CROSS JOIN LATERAL (
        SELECT candidates.*
          FROM (
            SELECT s.id AS site_id,
                   p.id AS park_id,
                   p.slug AS park_slug,
                   s.vendor_resource_location_id,
                   s.vendor_resource_id,
                   s.vendor_booking_category_id,
                   operator_queue.id AS operator_id,
                   operator_queue.base_url AS operator_base_url,
                   ofc.equipment_category_id,
                   ofc.sub_equipment_category_id,
                   NULL::TIMESTAMPTZ AS today_last_checked_at,
                   ars.hot_due_at,
                   ars.near_due_at,
                   ars.planning_due_at,
                   ars.deep_due_at,
                   w.due_at,
                   w.available_nights,
                   w.sampled_nights
              FROM parks p
              JOIN campgrounds c ON c.park_id = p.id
              JOIN sites s ON s.campground_id = c.id
              JOIN operator_fetch_config ofc ON ofc.operator_id = operator_queue.id
              LEFT JOIN availability_refresh_state ars ON ars.site_id = s.id
              CROSS JOIN LATERAL (
                SELECT CASE args.window_name
                         WHEN 'near' THEN ars.near_due_at
                         WHEN 'planning' THEN ars.planning_due_at
                         WHEN 'deep' THEN ars.deep_due_at
                         ELSE ars.hot_due_at
                       END AS due_at,
                       CASE args.window_name
                         WHEN 'near' THEN ars.near_available_nights
                         WHEN 'planning' THEN ars.planning_available_nights
                         WHEN 'deep' THEN ars.deep_available_nights
                         ELSE ars.hot_available_nights
                       END AS available_nights,
                       CASE args.window_name
                         WHEN 'near' THEN ars.near_sampled_nights
                         WHEN 'planning' THEN ars.planning_sampled_nights
                         WHEN 'deep' THEN ars.deep_sampled_nights
                         ELSE ars.hot_sampled_nights
                       END AS sampled_nights
              ) w
             WHERE p.operator_id = operator_queue.id
               AND s.vendor_resource_location_id IS NOT NULL
               AND s.vendor_resource_id IS NOT NULL
               AND (w.due_at IS NULL OR w.due_at <= now())
             ORDER BY
               CASE
                 WHEN w.available_nights > 0 THEN 0
                 WHEN w.sampled_nights = 0 THEN 1
                 ELSE 2
               END,
               w.due_at ASC NULLS FIRST,
               s.id ASC
             LIMIT (SELECT target_limit FROM args)
          ) candidates
      ) picked
  )
  SELECT ranked.site_id,
         ranked.park_id,
         ranked.park_slug,
         ranked.vendor_resource_location_id,
         ranked.vendor_resource_id,
         ranked.vendor_booking_category_id,
         ranked.operator_id,
         ranked.operator_base_url,
         ranked.equipment_category_id,
         ranked.sub_equipment_category_id,
         ranked.today_last_checked_at,
         ranked.hot_due_at,
         ranked.near_due_at,
         ranked.planning_due_at,
         ranked.deep_due_at
    FROM ranked
    CROSS JOIN args
   ORDER BY ranked.operator_rank ASC,
            CASE
              WHEN ranked.available_nights > 0 THEN 0
              WHEN ranked.sampled_nights = 0 THEN 1
              ELSE 2
            END,
            ranked.due_at ASC NULLS FIRST,
            ranked.operator_id ASC,
            ranked.site_id ASC
   LIMIT (SELECT target_limit FROM args);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION claim_availability_refresh_targets(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_availability_refresh_targets(TEXT, INTEGER) TO service_role;
