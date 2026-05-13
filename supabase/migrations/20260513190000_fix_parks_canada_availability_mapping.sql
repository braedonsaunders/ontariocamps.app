-- Parks Canada/PCRS has separate booking categories for normal campsites,
-- accommodations, backcountry, group sites, and parking. The generic name
-- matcher previously selected "Group Campsite" as the operator default, which
-- caused normal federal campsites to refresh as reserved.

UPDATE operator_fetch_config
   SET campsite_booking_category_id = 0,
       equipment_category_id = -32768,
       sub_equipment_category_id = -32768
 WHERE operator_id = 'parks_canada';

WITH category_map(resource_category_id, booking_category_id) AS (
  VALUES
    (-2147483648, 0), -- Campsite
    (-2147483641, 0),
    (-2147483647, 1), -- Parks Canada Accommodation
    (-2147483646, 1),
    (-2147483645, 1),
    (-2147483644, 1),
    (-2147483643, 1),
    (-2147483642, 1),
    (-2147483635, 1),
    (-2147483631, 1),
    (-2147483630, 1),
    (-2147483640, 2), -- Group Campsite
    (-2147483636, 5), -- Backcountry Campsite
    (-2147483634, 5),
    (-2147483633, 5),
    (-2147483632, 7), -- Backcountry Zone
    (-2147483629, 7)
)
UPDATE sites s
   SET vendor_booking_category_id = category_map.booking_category_id
  FROM campgrounds c,
       parks p,
       category_map
 WHERE c.id = s.campground_id
   AND p.id = c.park_id
   AND p.operator_id = 'parks_canada'
   AND s.source_detail->>'resourceCategoryId' ~ '^-?[0-9]+$'
   AND (s.source_detail->>'resourceCategoryId')::int = category_map.resource_category_id;

-- Use a site's own first allowed equipment tuple when present. This matters
-- for PCRS backcountry sites, which use the Backcountry equipment category
-- instead of the frontcountry Equipment category.

CREATE OR REPLACE VIEW availability_fetch_targets AS
SELECT s.id AS site_id,
       s.vendor_site_id,
       p.id AS park_id,
       p.slug AS park_slug,
       p.vendor_park_id,
       s.vendor_resource_location_id,
       s.vendor_resource_id,
       s.vendor_booking_category_id,
       o.id AS operator_id,
       o.vendor AS operator_vendor,
       o.base_url AS operator_base_url,
       COALESCE((s.allowed_equipment->0->>'equipmentCategoryId')::int, ofc.equipment_category_id) AS equipment_category_id,
       COALESCE((s.allowed_equipment->0->>'subEquipmentCategoryId')::int, ofc.sub_equipment_category_id) AS sub_equipment_category_id,
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

CREATE OR REPLACE FUNCTION claim_availability_refresh_targets(p_window TEXT, p_limit INTEGER)
RETURNS TABLE (
  site_id TEXT,
  vendor_site_id TEXT,
  park_id TEXT,
  park_slug TEXT,
  vendor_park_id TEXT,
  vendor_resource_location_id BIGINT,
  vendor_resource_id BIGINT,
  vendor_booking_category_id INTEGER,
  operator_id TEXT,
  operator_vendor TEXT,
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
  due_candidates AS (
    SELECT s.id AS site_id,
           s.vendor_site_id,
           p.id AS park_id,
           p.slug AS park_slug,
           p.vendor_park_id,
           s.vendor_resource_location_id,
           s.vendor_resource_id,
           s.vendor_booking_category_id,
           o.id AS operator_id,
           o.vendor AS operator_vendor,
           o.base_url AS operator_base_url,
           COALESCE((s.allowed_equipment->0->>'equipmentCategoryId')::int, ofc.equipment_category_id) AS equipment_category_id,
           COALESCE((s.allowed_equipment->0->>'subEquipmentCategoryId')::int, ofc.sub_equipment_category_id) AS sub_equipment_category_id,
           NULL::TIMESTAMPTZ AS today_last_checked_at,
           ars.hot_due_at,
           ars.near_due_at,
           ars.planning_due_at,
           ars.deep_due_at,
           w.due_at,
           COALESCE(w.available_nights, 0) AS available_nights,
           COALESCE(w.sampled_nights, 0) AS sampled_nights
      FROM parks p
      JOIN operators o ON o.id = p.operator_id
      JOIN campgrounds c ON c.park_id = p.id
      JOIN sites s ON s.campground_id = c.id
      JOIN operator_fetch_config ofc ON ofc.operator_id = o.id
      LEFT JOIN availability_refresh_state ars ON ars.site_id = s.id
      CROSS JOIN args
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
     WHERE s.vendor_resource_location_id IS NOT NULL
       AND s.vendor_resource_id IS NOT NULL
       AND (w.due_at IS NULL OR w.due_at <= now())
  ),
  operator_stats AS (
    SELECT operator_id,
           LEAST(8, GREATEST(1, CEIL(COUNT(*)::numeric / 2500.0)::integer)) AS operator_weight
      FROM due_candidates
     GROUP BY operator_id
  ),
  ranked AS (
    SELECT dc.*,
           os.operator_weight,
           row_number() OVER (
             PARTITION BY dc.operator_id
             ORDER BY
               CASE
                 WHEN dc.available_nights > 0 THEN 0
                 WHEN dc.sampled_nights = 0 THEN 1
                 ELSE 2
               END,
               dc.due_at ASC NULLS FIRST,
               dc.site_id ASC
           ) AS operator_rank
      FROM due_candidates dc
      JOIN operator_stats os ON os.operator_id = dc.operator_id
  ),
  trimmed AS (
    SELECT ranked.*
      FROM ranked
      CROSS JOIN args
     WHERE ranked.operator_rank <= args.target_limit
  )
  SELECT trimmed.site_id,
         trimmed.vendor_site_id,
         trimmed.park_id,
         trimmed.park_slug,
         trimmed.vendor_park_id,
         trimmed.vendor_resource_location_id,
         trimmed.vendor_resource_id,
         trimmed.vendor_booking_category_id,
         trimmed.operator_id,
         trimmed.operator_vendor,
         trimmed.operator_base_url,
         trimmed.equipment_category_id,
         trimmed.sub_equipment_category_id,
         trimmed.today_last_checked_at,
         trimmed.hot_due_at,
         trimmed.near_due_at,
         trimmed.planning_due_at,
         trimmed.deep_due_at
    FROM trimmed
    CROSS JOIN args
   ORDER BY FLOOR((trimmed.operator_rank - 1)::numeric / trimmed.operator_weight) ASC,
            CASE
              WHEN trimmed.available_nights > 0 THEN 0
              WHEN trimmed.sampled_nights = 0 THEN 1
              ELSE 2
            END,
            trimmed.due_at ASC NULLS FIRST,
            trimmed.operator_id ASC,
            trimmed.site_id ASC
   LIMIT (SELECT target_limit FROM args);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION claim_availability_refresh_targets(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_availability_refresh_targets(TEXT, INTEGER) TO service_role;
