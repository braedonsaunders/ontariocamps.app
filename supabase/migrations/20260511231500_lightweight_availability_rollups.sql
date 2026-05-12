-- Split hot-path rollups from analytics materialized-view refreshes.
--
-- Frequent availability ingest only needs parks/operators denormalized columns.
-- Analytics MVs are useful, but too heavy to refresh at the tail of every run.

CREATE OR REPLACE FUNCTION refresh_rollups() RETURNS void AS $$
BEGIN
  WITH park_stats AS (
    SELECT p.id AS park_id,
           count(DISTINCT c.id)::int AS cgs,
           count(DISTINCT s.id)::int AS total_sites,
           count(DISTINCT s.id) FILTER (WHERE sa.status = 'available')::int AS avail_sites,
           max(sa.last_checked_at) AS last_check
      FROM parks p
      LEFT JOIN campgrounds c ON c.park_id = p.id
      LEFT JOIN sites s ON s.campground_id = c.id
      LEFT JOIN site_availability sa
             ON sa.site_id = s.id
            AND sa.night_date = CURRENT_DATE
     GROUP BY p.id
  )
  UPDATE parks
     SET total_campgrounds = park_stats.cgs,
         total_sites = park_stats.total_sites,
         available_sites = park_stats.avail_sites,
         availability_pct = CASE WHEN park_stats.total_sites = 0 THEN 0
                                 ELSE (100.0 * park_stats.avail_sites / park_stats.total_sites)::int END,
         last_availability_at = park_stats.last_check
    FROM park_stats
   WHERE park_stats.park_id = parks.id;

  WITH operator_stats AS (
    SELECT o.id AS op_id,
           count(DISTINCT p.id)::int AS parks_n,
           count(DISTINCT c.id)::int AS cgs_n,
           count(DISTINCT s.id)::int AS sites_n,
           count(DISTINCT s.id) FILTER (WHERE sa.status = 'available')::int AS avail_n,
           max(sa.last_checked_at) AS last_check
      FROM operators o
      LEFT JOIN parks p ON p.operator_id = o.id
      LEFT JOIN campgrounds c ON c.park_id = p.id
      LEFT JOIN sites s ON s.campground_id = c.id
      LEFT JOIN site_availability sa
             ON sa.site_id = s.id
            AND sa.night_date = CURRENT_DATE
     GROUP BY o.id
  )
  UPDATE operators
     SET total_parks = operator_stats.parks_n,
         total_campgrounds = operator_stats.cgs_n,
         total_sites = operator_stats.sites_n,
         available_sites = operator_stats.avail_n,
         last_availability_at = operator_stats.last_check
    FROM operator_stats
   WHERE operator_stats.op_id = operators.id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_aggregates() RETURNS void AS $$
BEGIN
  PERFORM refresh_rollups();

  UPDATE operators o SET last_metadata_at = m.last_success_at
    FROM refresh_meta m
   WHERE m.refresh_type = 'metadata';

  REFRESH MATERIALIZED VIEW analytics_totals;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_status_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_region_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_site_type_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_time_series;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION refresh_rollups() TO authenticated;
