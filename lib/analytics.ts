/**
 * Analytics — one round-trip, one Postgres query, every chart served.
 *
 * All charts read denormalized columns or pre-materialized views, then
 * `json_build_object()` rolls the whole snapshot into a single payload so the
 * SSR page never juggles 10 parallel connections (which deadlocked on the
 * pgbouncer transaction-mode pool with `prepare: false`).
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
  closed: number;
};

/** Column-packed per-park nightly counts. `dates[i]` aligns with each park's
 *  `available[i]`, `reserved[i]`, `closed[i]`. Lets the client recompute any
 *  per-period aggregate (operator stack, region stack, leaderboard, status
 *  donut) without round-tripping. */
export type ParkNightSeries = {
  dates: string[];
  parks: Array<{
    slug: string;
    name: string;
    operator_id: string;
    operator: string;
    region: string;
    total_sites: number;
    available: number[];
    reserved: number[];
    closed: number[];
  }>;
};

export type AnalyticsSnapshot = {
  generated_at: string | null;
  totals: {
    operators: number;
    parks: number;
    /** Total campsite count across every operator. */
    sites: number;
    /** Sites with at least one bookable night across the window. */
    sites_with_availability: number;
    /** Per-night counts across (sites × window). These add to roughly
     *  sites × days-in-window; they are NOT site counts. */
    nights_available: number;
    nights_reserved: number;
    nights_closed: number;
    nights_unknown: number;
    nights_total: number;
  };
  statusBreakdown: StatusBreakdown[];
  operators: OperatorStatusRow[];
  regions: RegionRow[];
  siteTypes: SiteTypeRow[];
  leaderboard: { mostAvailable: ParkRanking[]; mostBooked: ParkRanking[] };
  electric: { electric: number; non_electric: number };
  timeSeries: TimeSeriesPoint[];
  parkNightSeries: ParkNightSeries;
};

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const rows = await sql()<Array<{ payload: AnalyticsSnapshot & { generated_at: string | Date | null } }>>`
    SELECT json_build_object(
      'generated_at',
        (SELECT last_success_at FROM refresh_meta WHERE refresh_type = 'availability'),
      'totals', (
        SELECT json_build_object(
          'operators',                t.operators,
          'parks',                    t.parks,
          'sites',                    t.sites,
          'sites_with_availability', (SELECT COALESCE(SUM(available_sites), 0)::int FROM operators),
          'nights_available',         t.available,
          'nights_reserved',          t.reserved,
          'nights_closed',            t.closed,
          'nights_unknown',           t.unknown,
          'nights_total',             (t.available + t.reserved + t.closed + t.unknown)
        )
          FROM analytics_totals t
      ),
      'statusBreakdown',
        COALESCE((SELECT json_agg(row_to_json(s) ORDER BY count DESC) FROM analytics_status_breakdown s), '[]'::json),
      'operators',
        COALESCE((SELECT json_agg(
          json_build_object(
            'operator_id', id,
            'operator',    name,
            'parks',       total_parks,
            'total_sites', total_sites,
            'available',   available_sites,
            'reserved',    GREATEST(0, total_sites - available_sites),
            'closed',      0,
            'unknown',     0
          )
          ORDER BY total_sites DESC
        ) FROM operators), '[]'::json),
      'regions',
        COALESCE((SELECT json_agg(row_to_json(r) ORDER BY total_sites DESC) FROM analytics_region_breakdown r), '[]'::json),
      'siteTypes',
        COALESCE((SELECT json_agg(row_to_json(s) ORDER BY count DESC) FROM analytics_site_type_breakdown s), '[]'::json),
      'electric',
        COALESCE((SELECT row_to_json(e) FROM analytics_electric e), json_build_object('electric', 0, 'non_electric', 0)),
      'timeSeries',
        COALESCE((SELECT json_agg(
          json_build_object(
            'night_date',    to_char(night_date, 'YYYY-MM-DD'),
            'total_sampled', total_sampled,
            'available',     available,
            'reserved',      reserved,
            'closed',        closed
          )
          ORDER BY night_date
        ) FROM analytics_time_series), '[]'::json),
      'leaderboard', json_build_object(
        'mostAvailable', COALESCE((SELECT json_agg(json_build_object(
          'slug', slug, 'name', name, 'region', region,
          'operator', operator, 'operator_id', operator_id,
          'total_sites', total_sites, 'available', available, 'availability_pct', availability_pct
        )) FROM (
          SELECT p.slug, p.name, p.region,
                 o.name AS operator, o.id AS operator_id,
                 p.total_sites, p.available_sites AS available, p.availability_pct
            FROM parks p JOIN operators o ON o.id = p.operator_id
           WHERE p.total_sites >= 5
           ORDER BY p.availability_pct DESC, p.total_sites DESC
           LIMIT 12
        ) top), '[]'::json),
        'mostBooked', COALESCE((SELECT json_agg(json_build_object(
          'slug', slug, 'name', name, 'region', region,
          'operator', operator, 'operator_id', operator_id,
          'total_sites', total_sites, 'available', available, 'availability_pct', availability_pct
        )) FROM (
          SELECT p.slug, p.name, p.region,
                 o.name AS operator, o.id AS operator_id,
                 p.total_sites, p.available_sites AS available, p.availability_pct
            FROM parks p JOIN operators o ON o.id = p.operator_id
           WHERE p.total_sites >= 5
           ORDER BY p.availability_pct ASC, p.total_sites DESC
           LIMIT 12
        ) bot), '[]'::json)
      )
    ) AS payload
  `;

  const p = rows[0].payload;
  const ga: unknown = p.generated_at;

  // Per-park per-night counts, packed column-oriented for compact transport.
  // ~13.5 k rows from the MV → ~250 KB on the wire after JSON encoding.
  const parkNightSeries = await loadParkNightSeries();

  return {
    ...p,
    generated_at:
      ga instanceof Date ? ga.toISOString() : ga ? String(ga) : null,
    parkNightSeries,
  };
}

async function loadParkNightSeries(): Promise<ParkNightSeries> {
  const rows = await sql()<Array<{
    park_id: string;
    slug: string;
    park_name: string;
    operator_id: string;
    operator: string;
    region: string;
    total_sites: number;
    night_date: Date | string;
    available: number;
    reserved: number;
    closed: number;
  }>>`
    SELECT park_id, slug, park_name, operator_id, operator, region, total_sites,
           night_date, available, reserved, closed
      FROM analytics_park_night
     ORDER BY park_id, night_date
  `;

  // First pass: collect the canonical date axis. Every park is sampled on the
  // same nights, so any park's date set works — but we collect the union just
  // to be safe.
  const dateSet = new Set<string>();
  for (const r of rows) {
    const d = r.night_date instanceof Date
      ? r.night_date.toISOString().slice(0, 10)
      : String(r.night_date).slice(0, 10);
    dateSet.add(d);
  }
  const dates = Array.from(dateSet).sort();
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  // Second pass: bucket per-park
  type ParkAccum = {
    slug: string; name: string; operator_id: string; operator: string;
    region: string; total_sites: number;
    available: number[]; reserved: number[]; closed: number[];
  };
  const byPark = new Map<string, ParkAccum>();
  for (const r of rows) {
    let acc = byPark.get(r.park_id);
    if (!acc) {
      acc = {
        slug: r.slug, name: r.park_name, operator_id: r.operator_id,
        operator: r.operator, region: r.region, total_sites: r.total_sites,
        available: new Array(dates.length).fill(0),
        reserved:  new Array(dates.length).fill(0),
        closed:    new Array(dates.length).fill(0),
      };
      byPark.set(r.park_id, acc);
    }
    const d = r.night_date instanceof Date
      ? r.night_date.toISOString().slice(0, 10)
      : String(r.night_date).slice(0, 10);
    const i = dateIndex.get(d);
    if (i == null) continue;
    acc.available[i] = r.available;
    acc.reserved[i]  = r.reserved;
    acc.closed[i]    = r.closed;
  }

  return { dates, parks: Array.from(byPark.values()) };
}
