-- Refine "available_sites" semantics.
--
-- The previous fix used CURRENT_DATE, but the availability ingest holds the
-- first 14 days back (booking systems freeze that window for opening day
-- traffic), so today's row simply doesn't exist — every park ended up at 0/N.
--
-- New semantics: `available_sites` = sites that are available on the FIRST
-- bookable night we have data for. That's `min(night_date)` across the
-- site_availability table — i.e., the soonest a user could actually reserve
-- something. Park-page UI still recomputes against any user-supplied date
-- range; this is only the headline rollup.

CREATE OR REPLACE FUNCTION refresh_aggregates() RETURNS void AS $$
DECLARE
  first_night DATE;
BEGIN
  SELECT min(night_date) INTO first_night FROM site_availability;
  -- If we have no data at all (cold DB), bail without touching denorms.
  IF first_night IS NULL THEN
    RETURN;
  END IF;

  -- Per-park rollups
  WITH stats AS (
    SELECT p.id AS park_id,
           count(distinct c.id)::int AS cgs,
           count(distinct s.id)::int AS total_sites,
           count(distinct s.id) FILTER (
             WHERE sa.night_date = first_night AND sa.status = 'available'
           )::int AS avail_sites,
           max(sa.last_checked_at) AS last_check
    FROM parks p
    LEFT JOIN campgrounds c        ON c.park_id = p.id
    LEFT JOIN sites s              ON s.campground_id = c.id
    LEFT JOIN site_availability sa ON sa.site_id = s.id
    GROUP BY p.id
  )
  UPDATE parks
  SET total_campgrounds   = stats.cgs,
      total_sites         = stats.total_sites,
      available_sites     = stats.avail_sites,
      availability_pct    = CASE WHEN stats.total_sites = 0 THEN 0
                                 ELSE (100.0 * stats.avail_sites / stats.total_sites)::int END,
      last_availability_at = stats.last_check
  FROM stats WHERE stats.park_id = parks.id;

  -- Per-operator rollups
  WITH stats AS (
    SELECT o.id AS op_id,
           count(distinct p.id)::int AS parks_n,
           count(distinct c.id)::int AS cgs_n,
           count(distinct s.id)::int AS sites_n,
           count(distinct s.id) FILTER (
             WHERE sa.night_date = first_night AND sa.status = 'available'
           )::int AS avail_n,
           max(sa.last_checked_at) AS last_check
    FROM operators o
    LEFT JOIN parks p              ON p.operator_id  = o.id
    LEFT JOIN campgrounds c        ON c.park_id      = p.id
    LEFT JOIN sites s              ON s.campground_id = c.id
    LEFT JOIN site_availability sa ON sa.site_id = s.id
    GROUP BY o.id
  )
  UPDATE operators
  SET total_parks       = stats.parks_n,
      total_campgrounds = stats.cgs_n,
      total_sites       = stats.sites_n,
      available_sites   = stats.avail_n,
      last_availability_at = stats.last_check
  FROM stats WHERE stats.op_id = operators.id;

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

SELECT refresh_aggregates();
