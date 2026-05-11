-- Fix the semantics of `parks.available_sites` and `operators.available_sites`.
--
-- The old definition was "count of sites with at least one available night
-- across the entire 90-day window". That made busy parks like Algonquin Lake
-- of Two Rivers read as 100 % open (every site has *some* free night in the
-- next 90 days) which is meaningless to a user looking at "is this park
-- bookable tonight".
--
-- New definition: a site is "available" iff *tonight*'s row in
-- site_availability has status = 'available'. The denormalised columns now
-- answer "how many sites can I book for tonight"; the park page still
-- recomputes against any user-supplied date range.

CREATE OR REPLACE FUNCTION refresh_aggregates() RETURNS void AS $$
DECLARE
  tonight DATE := CURRENT_DATE;
BEGIN
  -- Per-park rollups
  WITH stats AS (
    SELECT p.id AS park_id,
           count(distinct c.id)::int AS cgs,
           count(distinct s.id)::int AS total_sites,
           count(distinct s.id) FILTER (
             WHERE sa.night_date = tonight AND sa.status = 'available'
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
             WHERE sa.night_date = tonight AND sa.status = 'available'
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

  -- last_metadata_at on operators tracks the most-recent metadata refresh.
  UPDATE operators o SET last_metadata_at = m.last_success_at
    FROM refresh_meta m
    WHERE m.refresh_type = 'metadata';

  -- Refresh MVs. The single-row ones (analytics_totals, analytics_electric)
  -- can't be refreshed CONCURRENTLY because their unique index is a constant
  -- expression — Postgres needs more than one row to identify rows uniquely.
  REFRESH MATERIALIZED VIEW analytics_totals;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_status_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_region_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_site_type_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_time_series;
END;
$$ LANGUAGE plpgsql;

-- Run it once now so the page reflects the new semantics immediately.
SELECT refresh_aggregates();
