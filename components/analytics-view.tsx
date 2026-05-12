"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import type { AnalyticsSnapshot, ParkNightSeries } from "@/lib/analytics";
import { Database, Flame, Zap, TrendingUp, TrendingDown, Tent, Calendar } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  available: "#10b981",
  reserved: "#ef4444",
  closed: "#991b1b",
  unknown: "#a8a29e",
};
const OPERATOR_PALETTE = ["#37562e", "#456c38", "#5a8849", "#7ba36b", "#2b5d72", "#308ea6", "#4daac0", "#88cad9"];

function fmt(n: number): string {
  return n.toLocaleString();
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type PeriodKey = "tonight" | "weekend" | "month" | "season";

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "tonight", label: "Tonight" },
  { key: "weekend", label: "This weekend" },
  { key: "month", label: "This month" },
  { key: "season", label: "This season" },
];

/**
 * Resolve a period to an index range [from, to] into the parkNightSeries.dates
 * array. Returns null if the data window doesn't cover the requested period
 * at all (e.g. "Tonight" with no rows).
 *
 * - tonight: first row only
 * - weekend: next Fri-Sat-Sun starting on/after the first bookable night
 * - month  : first row through end of THAT calendar month
 * - season : first row through end of October (camping season ends Labour
 *            Day-ish; we round up to Oct 31)
 */
function indexRangeForPeriod(dates: string[], key: PeriodKey): { from: number; to: number } | null {
  if (dates.length === 0) return null;
  if (key === "tonight") return { from: 0, to: 0 };

  const first = new Date(dates[0] + "T00:00:00Z");

  if (key === "weekend") {
    const start = new Date(first);
    while (start.getUTCDay() !== 5) start.setUTCDate(start.getUTCDate() + 1);
    const startIso = start.toISOString().slice(0, 10);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 2); // Sunday
    const endIso = end.toISOString().slice(0, 10);
    let from = -1;
    let to = -1;
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      if (d >= startIso && from === -1) from = i;
      if (d <= endIso) to = i;
    }
    if (from === -1) return null;
    return { from, to };
  }

  if (key === "month") {
    const endOfMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const endIso = endOfMonth.toISOString().slice(0, 10);
    let to = 0;
    for (let i = 0; i < dates.length; i++) if (dates[i] <= endIso) to = i;
    return { from: 0, to };
  }

  if (key === "season") {
    const seasonEnd = new Date(Date.UTC(first.getUTCFullYear(), 9, 31)); // 9 = October
    const endIso = seasonEnd.toISOString().slice(0, 10);
    let to = 0;
    for (let i = 0; i < dates.length; i++) if (dates[i] <= endIso) to = i;
    return { from: 0, to };
  }

  return null;
}

/** Sum a per-park column-array between two indices (inclusive on both ends). */
function sumRange(arr: number[], from: number, to: number): number {
  let s = 0;
  for (let i = from; i <= to; i++) s += arr[i] ?? 0;
  return s;
}

/** Median across [from..to] of a per-night number array. Approximates
 *  "a typical night's count" for the period. */
function medianRange(arr: number[], from: number, to: number): number {
  if (from > to) return 0;
  const slice = arr.slice(from, to + 1).slice().sort((a, b) => a - b);
  const mid = Math.floor(slice.length / 2);
  return slice.length % 2 === 0 ? Math.round((slice[mid - 1] + slice[mid]) / 2) : slice[mid];
}

function PeriodTabs({ value, onChange }: { value: PeriodKey; onChange: (k: PeriodKey) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-stone-100 ring-1 ring-stone-200 overflow-x-auto">
      {PERIODS.map((p) => {
        const active = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              active ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function Stat({
  icon: Icon,
  title,
  value,
  sub,
  accent,
}: {
  icon: typeof Database;
  title: string;
  value: string;
  sub: string;
  accent?: "emerald" | "red" | "stone" | "amber";
}) {
  const bar =
    accent === "emerald"
      ? "from-emerald-400 to-emerald-600"
      : accent === "red"
      ? "from-red-400 to-red-600"
      : accent === "amber"
      ? "from-amber-400 to-amber-600"
      : "from-stone-400 to-stone-600";
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${bar}`} />
      <div className="flex items-center justify-between">
        <div className="text-xs text-stone-500 uppercase tracking-wide">{title}</div>
        <Icon size={14} className="text-stone-400" />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-stone-900">{value}</div>
      <div className="mt-1.5 text-xs text-stone-500 leading-tight">{sub}</div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const fmtLabel = label && /^\d{4}-\d{2}-\d{2}$/.test(label) ? fmtDate(label) : label;
  return (
    <div className="rounded-md bg-white shadow-md ring-1 ring-stone-200 px-3 py-2 text-xs">
      {fmtLabel && <div className="font-semibold text-stone-900 mb-1">{fmtLabel}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-stone-700">{p.name}</span>
          <span className="ml-2 font-medium text-stone-900 tabular-nums">{fmt(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

type PeriodAggregates = {
  // Per-night points across the period (for the stacked area chart)
  series: Array<{ night_date: string; available: number; reserved: number; closed: number; total: number }>;
  // Sum/median across period
  nightSums: { available: number; reserved: number; closed: number; total: number };
  // Per-operator stack (median across period per status)
  operators: Array<{
    name: string;
    operator_id: string;
    Available: number;
    Reserved: number;
    Closed: number;
  }>;
  // Per-region stack (median across period)
  regions: Array<{ name: string; Available: number; Booked: number; pct: number }>;
  // Status mix donut
  statusMix: Array<{ name: string; value: number }>;
  // Leaderboards
  mostAvailable: LeaderRow[];
  mostBooked: LeaderRow[];
  // Range info
  rangeLabel: string;
  daysInWindow: number;
};

type LeaderRow = {
  slug: string;
  name: string;
  operator: string;
  operator_id: string;
  region: string;
  total_sites: number;
  available: number;
  availability_pct: number;
};

function buildPeriodAggregates(pns: ParkNightSeries, period: PeriodKey): PeriodAggregates {
  const range = indexRangeForPeriod(pns.dates, period);
  if (!range) {
    return {
      series: [],
      nightSums: { available: 0, reserved: 0, closed: 0, total: 0 },
      operators: [],
      regions: [],
      statusMix: [],
      mostAvailable: [],
      mostBooked: [],
      rangeLabel: "no data",
      daysInWindow: 0,
    };
  }
  const { from, to } = range;
  const N = to - from + 1;

  // Per-night summed across all parks
  const series = pns.dates.slice(from, to + 1).map((d, idx) => {
    const i = from + idx;
    let av = 0;
    let re = 0;
    let cl = 0;
    for (const p of pns.parks) {
      av += p.available[i] ?? 0;
      re += p.reserved[i] ?? 0;
      cl += p.closed[i] ?? 0;
    }
    return { night_date: d, available: av, reserved: re, closed: cl, total: av + re + cl };
  });

  const nightSums = series.reduce(
    (acc, p) => {
      acc.available += p.available;
      acc.reserved += p.reserved;
      acc.closed += p.closed;
      acc.total += p.total;
      return acc;
    },
    { available: 0, reserved: 0, closed: 0, total: 0 },
  );

  // Per-operator aggregation: median over period
  const operatorMap = new Map<
    string,
    { name: string; available: number[]; reserved: number[]; closed: number[] }
  >();
  for (const p of pns.parks) {
    let acc = operatorMap.get(p.operator_id);
    if (!acc) {
      acc = {
        name: p.operator,
        available: new Array(N).fill(0),
        reserved: new Array(N).fill(0),
        closed: new Array(N).fill(0),
      };
      operatorMap.set(p.operator_id, acc);
    }
    for (let i = 0; i < N; i++) {
      acc.available[i] += p.available[from + i] ?? 0;
      acc.reserved[i] += p.reserved[from + i] ?? 0;
      acc.closed[i] += p.closed[from + i] ?? 0;
    }
  }
  const operators = Array.from(operatorMap.entries())
    .map(([operator_id, agg]) => ({
      operator_id,
      name: agg.name.replace(/ Region CA$/, " CA").replace(/ Peninsula CA$/, " CA"),
      Available: medianRange(agg.available, 0, N - 1),
      Reserved: medianRange(agg.reserved, 0, N - 1),
      Closed: medianRange(agg.closed, 0, N - 1),
    }))
    .sort((a, b) => b.Available + b.Reserved + b.Closed - (a.Available + a.Reserved + a.Closed));

  // Per-region aggregation: total sites at parks in that region + median available
  const regionMap = new Map<
    string,
    { totalSites: number; available: number[] }
  >();
  for (const p of pns.parks) {
    const region = p.region?.trim() || "Unknown";
    let acc = regionMap.get(region);
    if (!acc) {
      acc = { totalSites: 0, available: new Array(N).fill(0) };
      regionMap.set(region, acc);
    }
    acc.totalSites += p.total_sites;
    for (let i = 0; i < N; i++) acc.available[i] += p.available[from + i] ?? 0;
  }
  const regions = Array.from(regionMap.entries())
    .map(([name, agg]) => {
      const med = medianRange(agg.available, 0, N - 1);
      return {
        name,
        Available: med,
        Booked: Math.max(0, agg.totalSites - med),
        pct: agg.totalSites > 0 ? Math.round((med / agg.totalSites) * 100) : 0,
      };
    })
    .sort((a, b) => b.Available + b.Booked - (a.Available + a.Booked));

  // Status mix donut: total site-nights by status across the period
  const statusMix = [
    { name: "available", value: nightSums.available },
    { name: "reserved", value: nightSums.reserved },
    { name: "closed", value: nightSums.closed },
  ];

  // Leaderboards: median available % per park
  const parkRanks: LeaderRow[] = pns.parks
    .filter((p) => p.total_sites >= 5)
    .map((p) => {
      const med = medianRange(p.available, from, to);
      return {
        slug: p.slug,
        name: p.name,
        operator: p.operator,
        operator_id: p.operator_id,
        region: p.region ?? "",
        total_sites: p.total_sites,
        available: med,
        availability_pct: p.total_sites > 0 ? Math.round((med / p.total_sites) * 100) : 0,
      };
    });
  const mostAvailable = [...parkRanks]
    .sort((a, b) => b.availability_pct - a.availability_pct || b.total_sites - a.total_sites)
    .slice(0, 12);
  const mostBooked = [...parkRanks]
    .sort((a, b) => a.availability_pct - b.availability_pct || b.total_sites - a.total_sites)
    .slice(0, 12);

  // Range label
  const rangeLabel =
    series.length === 1
      ? fmtDate(series[0].night_date)
      : `${fmtDate(series[0].night_date)} – ${fmtDate(series[series.length - 1].night_date)}`;

  return {
    series,
    nightSums,
    operators,
    regions,
    statusMix,
    mostAvailable,
    mostBooked,
    rangeLabel,
    daysInWindow: N,
  };
}

export function AnalyticsView({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const { totals, siteTypes, electric, parkNightSeries } = snapshot;
  const [period, setPeriod] = useState<PeriodKey>("tonight");

  const agg = useMemo(
    () => buildPeriodAggregates(parkNightSeries, period),
    [parkNightSeries, period],
  );

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "Selected window";

  // Median across period for the headline cards
  const medianAvailable = (() => {
    if (agg.series.length === 0) return 0;
    if (agg.series.length === 1) return agg.series[0].available;
    const arr = agg.series.map((p) => p.available).sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 0 ? Math.round((arr[mid - 1] + arr[mid]) / 2) : arr[mid];
  })();
  const medianReserved = (() => {
    if (agg.series.length === 0) return 0;
    if (agg.series.length === 1) return agg.series[0].reserved;
    const arr = agg.series.map((p) => p.reserved).sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 0 ? Math.round((arr[mid - 1] + arr[mid]) / 2) : arr[mid];
  })();
  const availPct = totals.sites > 0 ? Math.round((medianAvailable / totals.sites) * 100) : 0;
  const reservedPct = totals.sites > 0 ? Math.round((medianReserved / totals.sites) * 100) : 0;

  const siteTypePieData = (() => {
    const top = siteTypes.slice(0, 10);
    const rest = siteTypes.slice(10);
    const data = top.map((s) => ({ name: s.label, value: s.count }));
    const otherSum = rest.reduce((sum, s) => sum + s.count, 0);
    if (otherSum > 0) data.push({ name: "Other", value: otherSum });
    return data;
  })();
  const electricPieData = [
    { name: "With electric", value: electric.electric, color: "#f59e0b" },
    { name: "No electric", value: electric.non_electric, color: "#78716c" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Ontario camping right now</h1>
          <p className="text-stone-600 mt-1">
            Live availability across every park network we index. Updated{" "}
            <span className="font-medium text-stone-900">{formatRelative(snapshot.generated_at)}</span>.
          </p>
        </div>
        <Link href="/search" className="btn-primary">
          Search available sites →
        </Link>
      </div>

      {/* Period selector */}
      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        <PeriodTabs value={period} onChange={setPeriod} />
        <div className="text-xs text-stone-500 inline-flex items-center gap-1.5">
          <Calendar size={12} />
          {periodLabel} · <span className="text-stone-700">{agg.rangeLabel}</span>
        </div>
      </div>

      {/* Period-aware headline cards */}
      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={Database}
          title="Sites indexed"
          value={fmt(totals.sites)}
          sub={`${fmt(totals.parks)} parks · ${fmt(totals.operators)} networks`}
        />
        <Stat
          icon={TrendingUp}
          title={agg.daysInWindow <= 1 ? "Sites available" : "Sites available (typical night)"}
          value={fmt(medianAvailable)}
          sub={`${availPct}% of indexed sites · ${periodLabel.toLowerCase()}`}
          accent="emerald"
        />
        <Stat
          icon={Flame}
          title={agg.daysInWindow <= 1 ? "Sites booked" : "Sites booked (typical night)"}
          value={fmt(medianReserved)}
          sub={`${reservedPct}% of indexed sites · ${periodLabel.toLowerCase()}`}
          accent="red"
        />
        <Stat
          icon={Tent}
          title="Site-nights in window"
          value={fmt(agg.nightSums.total)}
          sub={`${fmt(agg.nightSums.available)} bookable nights across ${agg.daysInWindow} ${
            agg.daysInWindow === 1 ? "night" : "nights"
          }`}
          accent="amber"
        />
      </div>

      {/* Stacked sites-over-time area chart */}
      {agg.series.length > 1 && (
        <section className="mt-8 card p-5">
          <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Sites available over time</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Stacked count of every indexed site by status, night-by-night across {periodLabel.toLowerCase()} ({agg.rangeLabel}).
              </p>
            </div>
            <div className="text-xs text-stone-600">
              <span className="font-semibold text-stone-900">
                {agg.nightSums.total > 0 ? Math.round((agg.nightSums.available / agg.nightSums.total) * 100) : 0}%
              </span>{" "}
              avg openness
            </div>
          </div>
          <div className="h-80 mt-4 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={agg.series} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="g-av" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="g-re" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="g-cl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#78716c" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#78716c" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  dataKey="night_date"
                  tick={{ fontSize: 10, fill: "#78716c" }}
                  tickFormatter={(v) => fmtDate(v)}
                  interval={Math.max(0, Math.floor(agg.series.length / 8))}
                />
                <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                <Area type="monotone" stackId="1" dataKey="available" name="Available" stroke="#059669" strokeWidth={1} fill="url(#g-av)" />
                <Area type="monotone" stackId="1" dataKey="reserved" name="Reserved" stroke="#b91c1c" strokeWidth={1} fill="url(#g-re)" />
                <Area type="monotone" stackId="1" dataKey="closed" name="Closed" stroke="#57534e" strokeWidth={1} fill="url(#g-cl)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {agg.series.length === 1 && (
        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold tracking-tight">Tonight at a glance</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Single-night snapshot for {agg.rangeLabel}. Pick a wider window for the over-time chart.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg p-4 bg-emerald-50 ring-1 ring-emerald-200">
              <div className="text-emerald-700 uppercase text-[10px] font-semibold tracking-wide">Available</div>
              <div className="text-2xl font-semibold text-stone-900 tabular-nums mt-1">{fmt(agg.nightSums.available)}</div>
              <div className="text-xs text-stone-500 mt-0.5">sites bookable</div>
            </div>
            <div className="rounded-lg p-4 bg-red-50 ring-1 ring-red-200">
              <div className="text-red-700 uppercase text-[10px] font-semibold tracking-wide">Reserved</div>
              <div className="text-2xl font-semibold text-stone-900 tabular-nums mt-1">{fmt(agg.nightSums.reserved)}</div>
              <div className="text-xs text-stone-500 mt-0.5">sites taken</div>
            </div>
            <div className="rounded-lg p-4 bg-stone-100 ring-1 ring-stone-200">
              <div className="text-stone-700 uppercase text-[10px] font-semibold tracking-wide">Closed</div>
              <div className="text-2xl font-semibold text-stone-900 tabular-nums mt-1">{fmt(agg.nightSums.closed)}</div>
              <div className="text-xs text-stone-500 mt-0.5">seasonal / unbookable</div>
            </div>
          </div>
        </section>
      )}

      {/* Per-network stacked — now period-aware */}
      <section className="mt-6 card p-5">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Booking pressure by network</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Each network&apos;s sites split by status — median across {periodLabel.toLowerCase()}.
            </p>
          </div>
        </div>
        <div className="h-72 mt-4 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agg.operators} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e5e4" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#78716c" }} tickFormatter={(v) => v.toLocaleString()} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1c1917" }} width={150} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Available" stackId="s" fill="#10b981" />
              <Bar dataKey="Reserved" stackId="s" fill="#ef4444" />
              <Bar dataKey="Closed" stackId="s" fill="#991b1b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Region + status mix — both period-aware */}
      <section className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight">Availability by region</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            How many of each region&apos;s sites are bookable across {periodLabel.toLowerCase()}.
          </p>
          <div className="h-64 mt-4 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agg.regions} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#78716c" }} interval={0} angle={-15} textAnchor="end" height={56} />
                <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Available" stackId="s" fill="#10b981" />
                <Bar dataKey="Booked" stackId="s" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="text-lg font-semibold tracking-tight">Status mix</h2>
          <p className="text-xs text-stone-500 mt-0.5">Site-nights across {periodLabel.toLowerCase()}.</p>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={agg.statusMix}
                  dataKey="value"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {agg.statusMix.map((s) => (
                    <Cell key={s.name} fill={STATUS_COLORS[s.name] ?? "#a8a29e"} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            {agg.statusMix.map((s) => (
              <div key={s.name} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.name] ?? "#a8a29e" }} />
                  <span className="capitalize text-stone-700">{s.name}</span>
                </span>
                <span className="font-medium text-stone-900 tabular-nums">{fmt(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Site type breakdown + Electric vs non — structural, NOT period-aware */}
      <section className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight">What kinds of sites?</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Operator-reported site type — structural breakdown across every indexed site.
          </p>
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={siteTypePieData}
                  dataKey="value"
                  nameKey="name"
                  cx="35%"
                  cy="50%"
                  innerRadius="40%"
                  outerRadius="80%"
                  paddingAngle={1.5}
                  isAnimationActive={false}
                >
                  {siteTypePieData.map((_, i) => (
                    <Cell key={i} fill={OPERATOR_PALETTE[i % OPERATOR_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, lineHeight: "20px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
            <Zap size={16} className="text-amber-500" /> Electric vs non
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">Derived from each site&apos;s operator-reported type.</p>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={electricPieData} dataKey="value" innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
                  {electricPieData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            {electricPieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-stone-700">{d.name}</span>
                </span>
                <span className="font-medium text-stone-900 tabular-nums">{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leaderboards — period-aware */}
      <section className="mt-6 grid lg:grid-cols-2 gap-6">
        <Leaderboard
          title={`Most available · ${periodLabel.toLowerCase()}`}
          subtitle="Parks with the largest share of bookable sites"
          icon={TrendingUp}
          accent="emerald"
          rows={agg.mostAvailable}
        />
        <Leaderboard
          title={`Most booked · ${periodLabel.toLowerCase()}`}
          subtitle="Parks where almost everything is taken"
          icon={TrendingDown}
          accent="red"
          rows={agg.mostBooked}
        />
      </section>

      <p className="mt-10 text-xs text-stone-500 leading-relaxed">
        Sources: Ontario Parks (Camis5), Parks Canada (PCRSv3), and the GoingToCamp-backed Conservation Authorities,
        polled live for this snapshot. <Link href="/data" className="text-forest-700 hover:underline">See data freshness</Link>{" "}
        for per-operator update times.
      </p>
    </div>
  );
}

function Leaderboard({
  title,
  subtitle,
  icon: Icon,
  accent,
  rows,
}: {
  title: string;
  subtitle: string;
  icon: typeof TrendingUp;
  accent: "emerald" | "red";
  rows: LeaderRow[];
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
            <Icon size={16} className={accent === "emerald" ? "text-emerald-600" : "text-red-600"} />
            {title}
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <ol className="mt-4 space-y-1.5">
        {rows.length === 0 ? (
          <li className="text-sm text-stone-500">No parks in this window.</li>
        ) : (
          rows.map((r, i) => {
            const pctColor =
              accent === "emerald"
                ? r.availability_pct >= 50
                  ? "text-emerald-700"
                  : "text-stone-700"
                : r.availability_pct < 20
                ? "text-red-700"
                : "text-stone-700";
            return (
              <li key={r.slug} className="flex items-baseline justify-between gap-3 py-1 group">
                <span className="text-xs text-stone-400 w-5 shrink-0 tabular-nums">{i + 1}</span>
                <Link href={`/park/${r.slug}`} className="flex-1 truncate text-sm text-stone-800 hover:text-forest-700">
                  {r.name}
                </Link>
                <span className="text-xs text-stone-500 truncate hidden sm:inline">{r.region}</span>
                <span className={`text-sm font-semibold tabular-nums ${pctColor}`}>{r.availability_pct}%</span>
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
