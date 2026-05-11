/**
 * Analytics — every chart is `SELECT * FROM <materialized_view>`.
 * MVs are refreshed by `refresh_aggregates()` at the tail of each
 * availability ingest, so reads are sub-millisecond.
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
  const client = sql();
  const [
    meta,
    totals,
    statusBreakdown,
    operators,
    regions,
    siteTypes,
    leaderboard,
    electric,
    timeSeries,
  ] = await Promise.all([
    client<Array<{ last_success_at: Date | string }>>`SELECT last_success_at FROM refresh_meta WHERE refresh_type = 'availability'`,
    client<Array<AnalyticsSnapshot["totals"]>>`SELECT * FROM analytics_totals`,
    client<StatusBreakdown[]>`SELECT status, count FROM analytics_status_breakdown ORDER BY count DESC`,
    // Per-operator counts come straight off the operators table (denorm'd)
    client<Array<{
      id: string; name: string;
      total_parks: number; total_sites: number;
      available_sites: number;
    }>>`SELECT id, name, total_parks, total_sites, available_sites FROM operators ORDER BY total_sites DESC`,
    client<RegionRow[]>`SELECT region, parks, total_sites, available FROM analytics_region_breakdown ORDER BY total_sites DESC`,
    client<SiteTypeRow[]>`SELECT label, count FROM analytics_site_type_breakdown ORDER BY count DESC`,
    parkLeaderboard(12),
    client<Array<{ electric: number; non_electric: number }>>`SELECT electric, non_electric FROM analytics_electric`,
    client<Array<{ night_date: Date | string; total_sampled: number; available: number; reserved: number }>>`
      SELECT night_date, total_sampled, available, reserved FROM analytics_time_series ORDER BY night_date
    `,
  ]);

  const last = meta[0]?.last_success_at;
  return {
    generated_at: last ? (last instanceof Date ? last.toISOString() : String(last)) : null,
    totals: totals[0],
    statusBreakdown,
    operators: operators.map((o) => ({
      operator_id: o.id,
      operator: o.name,
      parks: o.total_parks,
      total_sites: o.total_sites,
      available: o.available_sites,
      // Per-status counts that aren't denormalized on operators — leave 0; the
      // chart uses available + (total - available) where useful.
      reserved: Math.max(0, o.total_sites - o.available_sites),
      closed: 0,
      unknown: 0,
    })),
    regions,
    siteTypes,
    leaderboard,
    electric: electric[0] ?? { electric: 0, non_electric: 0 },
    timeSeries: timeSeries.map((r) => ({
      night_date: r.night_date instanceof Date ? r.night_date.toISOString().slice(0, 10) : String(r.night_date).slice(0, 10),
      total_sampled: r.total_sampled,
      available: r.available,
      reserved: r.reserved,
    })),
  };
}

async function parkLeaderboard(limit: number) {
  const client = sql();
  const [top, bottom] = await Promise.all([
    client<ParkRanking[]>`
      SELECT p.slug, p.name, p.region,
             o.name AS operator, o.id AS operator_id,
             p.total_sites, p.available_sites AS available, p.availability_pct
        FROM parks p JOIN operators o ON o.id = p.operator_id
       WHERE p.total_sites >= 5
       ORDER BY p.availability_pct DESC, p.total_sites DESC
       LIMIT ${limit}
    `,
    client<ParkRanking[]>`
      SELECT p.slug, p.name, p.region,
             o.name AS operator, o.id AS operator_id,
             p.total_sites, p.available_sites AS available, p.availability_pct
        FROM parks p JOIN operators o ON o.id = p.operator_id
       WHERE p.total_sites >= 5
       ORDER BY p.availability_pct ASC, p.total_sites DESC
       LIMIT ${limit}
    `,
  ]);
  return { mostAvailable: top, mostBooked: bottom };
}
