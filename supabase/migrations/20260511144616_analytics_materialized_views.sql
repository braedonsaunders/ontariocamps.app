-- Denormalized rollup columns + analytics materialized views.
--
-- Hot pages (/operators, /operator/[id], /api/parks/summary) read from the
-- denormalized columns and get sub-millisecond rows.
-- Cross-cutting analytics (status breakdown, time series, leaderboard) read
-- from materialized views.
--
-- Everything is refreshed at the tail of each `npm run ingest:availability`
-- run by the `refresh_aggregates()` function.

-- ─── Denormalized columns on operators ────────────────────────────────────

ALTER TABLE operators ADD COLUMN IF NOT EXISTS total_parks         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS total_campgrounds   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS total_sites         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS available_sites     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS last_metadata_at    TIMESTAMPTZ;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS last_availability_at TIMESTAMPTZ;

-- ─── Denormalized columns on parks ────────────────────────────────────────

ALTER TABLE parks ADD COLUMN IF NOT EXISTS total_campgrounds   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE parks ADD COLUMN IF NOT EXISTS total_sites         INTEGER NOT NULL DEFAULT 0;
ALTER TABLE parks ADD COLUMN IF NOT EXISTS available_sites     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE parks ADD COLUMN IF NOT EXISTS availability_pct    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE parks ADD COLUMN IF NOT EXISTS last_availability_at TIMESTAMPTZ;

-- ─── Materialized views for the analytics page ────────────────────────────
-- These don't fit cleanly on the operators/parks tables (cross-cutting
-- aggregates: status breakdown, per-night time series, region rollup, etc.).

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_totals AS
SELECT
  (SELECT count(*) FROM operators)::int AS operators,
  (SELECT count(*) FROM parks)::int     AS parks,
  (SELECT count(*) FROM sites)::int     AS sites,
  (SELECT count(*) FROM site_availability WHERE status='available')::int AS available,
  (SELECT count(*) FROM site_availability WHERE status='reserved')::int  AS reserved,
  (SELECT count(*) FROM site_availability WHERE status='closed')::int    AS closed,
  (SELECT count(*) FROM site_availability WHERE status='unknown' OR status IS NULL)::int AS unknown;
CREATE UNIQUE INDEX IF NOT EXISTS analytics_totals_pk ON analytics_totals((1));

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_status_breakdown AS
SELECT status, count(*)::int AS count
  FROM site_availability GROUP BY status;
CREATE UNIQUE INDEX IF NOT EXISTS analytics_status_breakdown_pk ON analytics_status_breakdown(status);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_region_breakdown AS
SELECT
  COALESCE(NULLIF(p.region, ''), 'Unknown') AS region,
  count(distinct p.id)::int AS parks,
  count(distinct s.id)::int AS total_sites,
  count(*) FILTER (WHERE sa.status = 'available')::int AS available
FROM parks p
JOIN campgrounds c            ON c.park_id      = p.id
JOIN sites s                  ON s.campground_id = c.id
LEFT JOIN site_availability sa ON sa.site_id = s.id
GROUP BY region;
CREATE UNIQUE INDEX IF NOT EXISTS analytics_region_breakdown_pk ON analytics_region_breakdown(region);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_site_type_breakdown AS
SELECT COALESCE(site_type_label, site_type) AS label, count(*)::int AS count
  FROM sites GROUP BY label;
CREATE UNIQUE INDEX IF NOT EXISTS analytics_site_type_breakdown_pk ON analytics_site_type_breakdown(label);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_time_series AS
SELECT
  night_date,
  count(*)::int AS total_sampled,
  count(*) FILTER (WHERE status='available')::int AS available,
  count(*) FILTER (WHERE status='reserved') ::int AS reserved
FROM site_availability
GROUP BY night_date;
CREATE UNIQUE INDEX IF NOT EXISTS analytics_time_series_pk ON analytics_time_series(night_date);

GRANT SELECT ON analytics_totals               TO anon, authenticated;
GRANT SELECT ON analytics_status_breakdown     TO anon, authenticated;
GRANT SELECT ON analytics_region_breakdown     TO anon, authenticated;
GRANT SELECT ON analytics_site_type_breakdown  TO anon, authenticated;
GRANT SELECT ON analytics_time_series          TO anon, authenticated;

-- ─── refresh_aggregates() ─────────────────────────────────────────────────
-- Single entrypoint called by `ingest:availability` after row writes commit.
-- Updates denormalized columns + refreshes MVs. Plain UPDATE on operators/parks
-- is fast (8 rows + ~149 rows). MV refreshes are the slow part but still
-- happen once per ingest, not per request.
CREATE OR REPLACE FUNCTION refresh_aggregates() RETURNS void AS $$
BEGIN
  -- Per-park rollups
  WITH stats AS (
    SELECT p.id AS park_id,
           count(distinct c.id)::int AS cgs,
           count(distinct s.id)::int AS total_sites,
           count(distinct CASE WHEN sa.status='available' THEN s.id END)::int AS avail_sites,
           max(sa.last_checked_at) AS last_check,
           count(distinct s.id) AS denom_for_pct,
           count(distinct CASE WHEN sa.status='available' THEN s.id END) AS num_for_pct
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
      availability_pct    = CASE WHEN stats.denom_for_pct = 0 THEN 0
                                 ELSE (100.0 * stats.num_for_pct / stats.denom_for_pct)::int END,
      last_availability_at = stats.last_check
  FROM stats WHERE stats.park_id = parks.id;

  -- Per-operator rollups
  WITH stats AS (
    SELECT o.id AS op_id,
           count(distinct p.id)::int AS parks_n,
           count(distinct c.id)::int AS cgs_n,
           count(distinct s.id)::int AS sites_n,
           count(distinct CASE WHEN sa.status='available' THEN s.id END)::int AS avail_n,
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

  -- Refresh MVs
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_totals;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_status_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_region_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_site_type_breakdown;
  REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_time_series;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION refresh_aggregates() TO authenticated;
