-- Per-(park, night) status counts. Lets the analytics page recompute every
-- chart against a user-selected period without re-querying the DB. The MV is
-- denormalised on slug/operator/region so the client can do all the
-- group-bys (operator, region, leaderboards, etc.) locally.
--
-- 149 parks × ~91 nights ≈ 13.5 k rows × ~200 bytes JSON ≈ ~2.5 MB
-- uncompressed; column-oriented re-packing in the snapshot query trims
-- that to ~250 KB on the wire.

DROP MATERIALIZED VIEW IF EXISTS analytics_park_night CASCADE;

CREATE MATERIALIZED VIEW analytics_park_night AS
SELECT p.id          AS park_id,
       p.slug,
       p.name        AS park_name,
       o.id          AS operator_id,
       o.name        AS operator,
       p.region,
       p.total_sites,
       sa.night_date,
       count(*) FILTER (WHERE sa.status = 'available')::int AS available,
       count(*) FILTER (WHERE sa.status = 'reserved') ::int AS reserved,
       count(*) FILTER (WHERE sa.status = 'closed')   ::int AS closed
  FROM parks p
  JOIN operators o            ON o.id = p.operator_id
  JOIN campgrounds c          ON c.park_id = p.id
  JOIN sites s                ON s.campground_id = c.id
  JOIN site_availability sa   ON sa.site_id = s.id
 GROUP BY p.id, p.slug, p.name, o.id, o.name, p.region, p.total_sites, sa.night_date;

CREATE UNIQUE INDEX analytics_park_night_pk ON analytics_park_night(park_id, night_date);
CREATE INDEX analytics_park_night_night_idx ON analytics_park_night(night_date);

GRANT SELECT ON analytics_park_night TO anon, authenticated;

REFRESH MATERIALIZED VIEW analytics_park_night;

-- Wire into refresh_aggregates() so the MV stays current after every
-- availability ingest.
CREATE OR REPLACE FUNCTION refresh_aggregates() RETURNS void AS $$
DECLARE
  first_night DATE;
BEGIN
  SELECT min(night_date) INTO first_night FROM site_availability;
  IF first_night IS NULL THEN
    RETURN;
  END IF;

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
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_park_night;
END;
$$ LANGUAGE plpgsql;
