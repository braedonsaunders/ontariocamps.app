/**
 * Pre-computed analytics rollups, all driven by SQL against `site_availability`
 * (the per-site per-night source of truth). No sampling — every chart reflects
 * the complete index.
 */

import { db } from "./db/client";

export type StatusBreakdown = { status: string; count: number };
export type OperatorStatusRow = {
  operator_id: string;
  operator: string;
  parks: number;
  total_sites: number;
  available: number;
  reserved: number;
  closed: number;
  unknown: number;
};
export type RegionRow = {
  region: string;
  parks: number;
  total_sites: number;
  available: number;
};
export type SiteTypeRow = { label: string; count: number };
export type ParkRanking = {
  slug: string;
  name: string;
  operator: string;
  operator_id: string;
  region: string;
  total_sites: number;
  available: number;
  availability_pct: number;
};
export type TimeSeriesPoint = {
  night_date: string;
  total_sampled: number;   // total = all sites with data on this night
  available: number;
  reserved: number;
};

export function getStatusBreakdown(): StatusBreakdown[] {
  return db()
    .prepare(`SELECT status, count(*) as count FROM site_availability GROUP BY status ORDER BY count DESC`)
    .all() as StatusBreakdown[];
}

export function getOperatorBreakdown(): OperatorStatusRow[] {
  return db()
    .prepare(
      `SELECT
         o.id   AS operator_id,
         o.name AS operator,
         count(distinct p.id) AS parks,
         count(distinct s.id) AS total_sites,
         sum(case when sa.status='available' then 1 else 0 end) AS available,
         sum(case when sa.status='reserved'  then 1 else 0 end) AS reserved,
         sum(case when sa.status='closed'    then 1 else 0 end) AS closed,
         sum(case when sa.status='unknown' OR sa.status IS NULL then 1 else 0 end) AS unknown
       FROM operators o
       JOIN parks p             ON p.operator_id  = o.id
       JOIN campgrounds c       ON c.park_id      = p.id
       JOIN sites s             ON s.campground_id = c.id
       LEFT JOIN site_availability sa ON sa.site_id = s.id
       GROUP BY o.id, o.name
       HAVING total_sites > 0
       ORDER BY total_sites DESC`,
    )
    .all() as OperatorStatusRow[];
}

export function getRegionBreakdown(): RegionRow[] {
  return db()
    .prepare(
      `SELECT
         coalesce(nullif(p.region, ''), 'Unknown') AS region,
         count(distinct p.id) AS parks,
         count(distinct s.id) AS total_sites,
         sum(case when sa.status='available' then 1 else 0 end) AS available
       FROM parks p
       JOIN campgrounds c            ON c.park_id      = p.id
       JOIN sites s                  ON s.campground_id = c.id
       LEFT JOIN site_availability sa ON sa.site_id = s.id
       GROUP BY region
       HAVING total_sites > 0
       ORDER BY total_sites DESC`,
    )
    .all() as RegionRow[];
}

export function getSiteTypeBreakdown(): SiteTypeRow[] {
  return db()
    .prepare(
      `SELECT coalesce(site_type_label, site_type) AS label, count(*) AS count
       FROM sites GROUP BY label ORDER BY count DESC`,
    )
    .all() as SiteTypeRow[];
}

export function getParkLeaderboard(limit = 12): { mostAvailable: ParkRanking[]; mostBooked: ParkRanking[] } {
  const stmt = `
    WITH park_stats AS (
      SELECT p.id, p.slug, p.name, p.region,
             o.name AS operator, o.id AS operator_id,
             count(distinct s.id) AS total_sites,
             count(case when sa.status='available' then 1 end) AS available_nights,
             count(sa.site_id) AS total_nights
      FROM parks p
      JOIN operators o ON o.id = p.operator_id
      JOIN campgrounds c ON c.park_id = p.id
      JOIN sites s ON s.campground_id = c.id
      LEFT JOIN site_availability sa ON sa.site_id = s.id
      GROUP BY p.id
      HAVING total_sites >= 5
    )
    SELECT slug, name, operator, operator_id, region, total_sites,
           available_nights AS available,
           cast(round(100.0 * available_nights / max(total_nights, 1)) AS INTEGER) AS availability_pct
      FROM park_stats
  `;
  const mostAvailable = db().prepare(stmt + ` ORDER BY availability_pct DESC, total_sites DESC LIMIT ?`).all(limit) as ParkRanking[];
  const mostBooked   = db().prepare(stmt + ` ORDER BY availability_pct ASC,  total_sites DESC LIMIT ?`).all(limit) as ParkRanking[];
  return { mostAvailable, mostBooked };
}

export function getElectricRollup(): { electric: number; non_electric: number } {
  const row = db()
    .prepare(
      `SELECT
         sum(case when has_electric = 1 then 1 else 0 end) AS electric,
         sum(case when has_electric = 0 then 1 else 0 end) AS non_electric
       FROM sites`,
    )
    .get() as { electric: number; non_electric: number };
  return row;
}

/** Per-night aggregate across the entire index. Replaces the sampled
 *  `time_series_daily` table — now driven by the real per-site per-night data. */
export function getTimeSeriesDaily(): TimeSeriesPoint[] {
  return db()
    .prepare(
      `SELECT night_date,
              count(*) AS total_sampled,
              sum(case when status='available' then 1 else 0 end) AS available,
              sum(case when status='reserved'  then 1 else 0 end) AS reserved
       FROM site_availability
       GROUP BY night_date
       ORDER BY night_date`,
    )
    .all() as TimeSeriesPoint[];
}

export type AnalyticsSnapshot = {
  generated_at: string | null;
  totals: {
    operators: number;
    parks: number;
    sites: number;
    available: number;
    reserved: number;
    closed: number;
    unknown: number;
  };
  statusBreakdown: StatusBreakdown[];
  operators: OperatorStatusRow[];
  regions: RegionRow[];
  siteTypes: SiteTypeRow[];
  leaderboard: { mostAvailable: ParkRanking[]; mostBooked: ParkRanking[] };
  electric: { electric: number; non_electric: number };
  timeSeries: TimeSeriesPoint[];
};

export function getAnalyticsSnapshot(): AnalyticsSnapshot {
  const meta = db()
    .prepare(`SELECT last_success_at FROM refresh_meta WHERE refresh_type = 'availability'`)
    .get() as { last_success_at: string } | undefined;

  const totalsRow = db()
    .prepare(
      `SELECT
         (SELECT count(*) FROM operators) AS operators,
         (SELECT count(*) FROM parks)     AS parks,
         (SELECT count(*) FROM sites)     AS sites,
         (SELECT count(*) FROM site_availability WHERE status='available') AS available,
         (SELECT count(*) FROM site_availability WHERE status='reserved')  AS reserved,
         (SELECT count(*) FROM site_availability WHERE status='closed')    AS closed,
         (SELECT count(*) FROM site_availability WHERE status='unknown' OR status IS NULL) AS unknown`,
    )
    .get() as AnalyticsSnapshot["totals"];

  return {
    generated_at: meta?.last_success_at ?? null,
    totals: totalsRow,
    statusBreakdown: getStatusBreakdown(),
    operators: getOperatorBreakdown(),
    regions: getRegionBreakdown(),
    siteTypes: getSiteTypeBreakdown(),
    leaderboard: getParkLeaderboard(),
    electric: getElectricRollup(),
    timeSeries: getTimeSeriesDaily(),
  };
}
