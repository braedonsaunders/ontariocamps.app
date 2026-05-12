-- Cheap scheduled target selection for Cloudflare Worker refreshes.

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
BEGIN
  RETURN QUERY
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
         ars.hot_due_at,
         ars.near_due_at,
         ars.planning_due_at,
         ars.deep_due_at
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
     AND s.vendor_resource_id IS NOT NULL
     AND (
       CASE p_window
         WHEN 'near' THEN ars.near_due_at
         WHEN 'planning' THEN ars.planning_due_at
         WHEN 'deep' THEN ars.deep_due_at
         ELSE ars.hot_due_at
       END IS NULL
       OR CASE p_window
         WHEN 'near' THEN ars.near_due_at
         WHEN 'planning' THEN ars.planning_due_at
         WHEN 'deep' THEN ars.deep_due_at
         ELSE ars.hot_due_at
       END <= now()
     )
   ORDER BY
     CASE p_window
       WHEN 'near' THEN ars.near_due_at
       WHEN 'planning' THEN ars.planning_due_at
       WHEN 'deep' THEN ars.deep_due_at
       ELSE ars.hot_due_at
     END ASC NULLS FIRST,
     s.id ASC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 0), 0), 1000);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION claim_availability_refresh_targets(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_availability_refresh_targets(TEXT, INTEGER) TO service_role;
