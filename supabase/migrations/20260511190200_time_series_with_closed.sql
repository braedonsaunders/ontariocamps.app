-- Extend analytics_time_series with a `closed` column so the chart can render
-- a true stacked area (available + reserved + closed = total_sampled).

DROP MATERIALIZED VIEW IF EXISTS analytics_time_series CASCADE;

CREATE MATERIALIZED VIEW analytics_time_series AS
SELECT
  night_date,
  count(*)::int                                                AS total_sampled,
  count(*) FILTER (WHERE status = 'available')::int            AS available,
  count(*) FILTER (WHERE status = 'reserved') ::int            AS reserved,
  count(*) FILTER (WHERE status = 'closed')   ::int            AS closed
FROM site_availability
GROUP BY night_date;

CREATE UNIQUE INDEX analytics_time_series_pk ON analytics_time_series(night_date);

GRANT SELECT ON analytics_time_series TO anon, authenticated;

-- Trigger the refresh so subsequent SELECTs find populated data.
REFRESH MATERIALIZED VIEW analytics_time_series;
