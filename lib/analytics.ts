/**
 * Analytics rollups (Postgres). Every query reads from `site_availability`
 * — the per-site per-night table populated by `npm run ingest:availability`.
 */

import { sql } from "./db/client";

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
  total_sampled: number;
  available: number;
  reserved: number;
};

export async function getStatusBreakdown(): Promise<StatusBreakdown[]> {
  const rows = await sql()<Array<{ status: string; count: number }>>`
    SELECT status, count(*)::int AS count
      FROM site_availability
     GROUP BY status
     ORDER BY count DESC
  `;
  return rows.map((r) => ({ status: r.status, count: r.count }));
}

export async function getOperatorBreakdown(): Promise<OperatorStatusRow[]> {
  const rows = await sql()<Array<OperatorStatusRow>>`
    SELECT
      o.id   AS operator_id,
      o.name AS operator,
      count(distinct p.id)::int AS parks,
      count(distinct s.id)::int AS total_sites,
      count(case when sa.status = 'available' then 1 end)::int AS available,
      count(case when sa.status = 'reserved'  then 1 end)::int AS reserved,
      count(case when sa.status = 'closed'    then 1 end)::int AS closed,
      count(case when sa.status = 'unknown' OR sa.status IS NULL then 1 end)::int AS unknown
    FROM operators o
    JOIN parks p             ON p.operator_id  = o.id
    JOIN campgrounds c       ON c.park_id      = p.id
    JOIN sites s             ON s.campground_id = c.id
    LEFT JOIN site_availability sa ON sa.site_id = s.id
    GROUP BY o.id, o.name
    HAVING count(distinct s.id) > 0
    ORDER BY count(distinct s.id) DESC
  `;
  return rows.map((r) => r);
}

export async function getRegionBreakdown(): Promise<RegionRow[]> {
  const rows = await sql()<Array<RegionRow>>`
    SELECT
      COALESCE(NULLIF(p.region, ''), 'Unknown') AS region,
      count(distinct p.id)::int AS parks,
      count(distinct s.id)::int AS total_sites,
      count(case when sa.status = 'available' then 1 end)::int AS available
    FROM parks p
    JOIN campgrounds c            ON c.park_id      = p.id
    JOIN sites s                  ON s.campground_id = c.id
    LEFT JOIN site_availability sa ON sa.site_id = s.id
    GROUP BY region
    HAVING count(distinct s.id) > 0
    ORDER BY count(distinct s.id) DESC
  `;
  return rows.map((r) => r);
}

export async function getSiteTypeBreakdown(): Promise<SiteTypeRow[]> {
  const rows = await sql()<Array<SiteTypeRow>>`
    SELECT COALESCE(site_type_label, site_type) AS label, count(*)::int AS count
      FROM sites
     GROUP BY label
     ORDER BY count DESC
  `;
  return rows.map((r) => r);
}

export async function getParkLeaderboard(limit = 12): Promise<{ mostAvailable: ParkRanking[]; mostBooked: ParkRanking[] }> {
  const top = await sql()<Array<ParkRanking>>`
    WITH park_stats AS (
      SELECT p.slug, p.name, p.region,
             o.name AS operator, o.id AS operator_id,
             count(distinct s.id) AS total_sites,
             count(case when sa.status='available' then 1 end) AS available_nights,
             count(sa.site_id) AS total_nights
      FROM parks p
      JOIN operators o ON o.id = p.operator_id
      JOIN campgrounds c ON c.park_id = p.id
      JOIN sites s ON s.campground_id = c.id
      LEFT JOIN site_availability sa ON sa.site_id = s.id
      GROUP BY p.id, p.slug, p.name, p.region, o.id, o.name
      HAVING count(distinct s.id) >= 5
    )
    SELECT slug, name, operator, operator_id, region,
           total_sites::int AS total_sites,
           available_nights::int AS available,
           CASE WHEN total_nights = 0 THEN 0
                ELSE (100.0 * available_nights / total_nights)::int END AS availability_pct
      FROM park_stats
     ORDER BY availability_pct DESC, total_sites DESC
     LIMIT ${limit}
  `;
  const bottom = await sql()<Array<ParkRanking>>`
    WITH park_stats AS (
      SELECT p.slug, p.name, p.region,
             o.name AS operator, o.id AS operator_id,
             count(distinct s.id) AS total_sites,
             count(case when sa.status='available' then 1 end) AS available_nights,
             count(sa.site_id) AS total_nights
      FROM parks p
      JOIN operators o ON o.id = p.operator_id
      JOIN campgrounds c ON c.park_id = p.id
      JOIN sites s ON s.campground_id = c.id
      LEFT JOIN site_availability sa ON sa.site_id = s.id
      GROUP BY p.id, p.slug, p.name, p.region, o.id, o.name
      HAVING count(distinct s.id) >= 5
    )
    SELECT slug, name, operator, operator_id, region,
           total_sites::int AS total_sites,
           available_nights::int AS available,
           CASE WHEN total_nights = 0 THEN 0
                ELSE (100.0 * available_nights / total_nights)::int END AS availability_pct
      FROM park_stats
     ORDER BY availability_pct ASC, total_sites DESC
     LIMIT ${limit}
  `;
  return { mostAvailable: top.map((r) => r), mostBooked: bottom.map((r) => r) };
}

export async function getElectricRollup(): Promise<{ electric: number; non_electric: number }> {
  const rows = await sql()<Array<{ electric: number; non_electric: number }>>`
    SELECT
      count(case when has_electric = true then 1 end)::int AS electric,
      count(case when has_electric = false then 1 end)::int AS non_electric
    FROM sites
  `;
  return rows[0];
}

export async function getTimeSeriesDaily(): Promise<TimeSeriesPoint[]> {
  const rows = await sql()<Array<{
    night_date: Date | string; total_sampled: number; available: number; reserved: number;
  }>>`
    SELECT night_date,
           count(*)::int AS total_sampled,
           count(case when status='available' then 1 end)::int AS available,
           count(case when status='reserved'  then 1 end)::int AS reserved
      FROM site_availability
     GROUP BY night_date
     ORDER BY night_date
  `;
  return rows.map((r) => ({
    night_date: r.night_date instanceof Date ? r.night_date.toISOString().slice(0, 10) : String(r.night_date).slice(0, 10),
    total_sampled: r.total_sampled,
    available: r.available,
    reserved: r.reserved,
  }));
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

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const [meta, totals, statusBreakdown, operators, regions, siteTypes, leaderboard, electric, timeSeries] = await Promise.all([
    sql()<Array<{ last_success_at: Date | string }>>`SELECT last_success_at FROM refresh_meta WHERE refresh_type = 'availability'`,
    sql()<Array<AnalyticsSnapshot["totals"]>>`
      SELECT
        (SELECT count(*) FROM operators)::int AS operators,
        (SELECT count(*) FROM parks)::int     AS parks,
        (SELECT count(*) FROM sites)::int     AS sites,
        (SELECT count(*) FROM site_availability WHERE status='available')::int AS available,
        (SELECT count(*) FROM site_availability WHERE status='reserved')::int  AS reserved,
        (SELECT count(*) FROM site_availability WHERE status='closed')::int    AS closed,
        (SELECT count(*) FROM site_availability WHERE status='unknown' OR status IS NULL)::int AS unknown
    `,
    getStatusBreakdown(),
    getOperatorBreakdown(),
    getRegionBreakdown(),
    getSiteTypeBreakdown(),
    getParkLeaderboard(),
    getElectricRollup(),
    getTimeSeriesDaily(),
  ]);
  const last_success = meta[0]?.last_success_at;
  return {
    generated_at: last_success ? (last_success instanceof Date ? last_success.toISOString() : String(last_success)) : null,
    totals: totals[0],
    statusBreakdown,
    operators,
    regions,
    siteTypes,
    leaderboard,
    electric,
    timeSeries,
  };
}
