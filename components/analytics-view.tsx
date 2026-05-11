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
import type { AnalyticsSnapshot, TimeSeriesPoint } from "@/lib/analytics";
import { Database, MapPin, Flame, Zap, TrendingUp, TrendingDown, Tent, Calendar } from "lucide-react";

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

type PeriodKey = "tonight" | "weekend" | "month" | "summer" | "window";

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "tonight", label: "Tonight" },
  { key: "weekend", label: "This weekend" },
  { key: "month", label: "This month" },
  { key: "summer", label: "This summer" },
  { key: "window", label: "Next 90 days" },
];

/**
 * Slice the 90-day time series to the user's selected period. The `tonight`
 * label is a polite fiction — operators hold the first ~14 days back, so
 * tonight is really "the soonest night you could book". We treat the first
 * row of timeSeries as `tonight` for that reason.
 */
function sliceForPeriod(series: TimeSeriesPoint[], key: PeriodKey): TimeSeriesPoint[] {
  if (series.length === 0) return [];
  if (key === "window") return series;
  if (key === "tonight") return series.slice(0, 1);

  const first = new Date(series[0].night_date + "T00:00:00Z");

  if (key === "weekend") {
    // First Fri-Sat-Sun starting on or after the first bookable night.
    // We include Friday + Saturday + Sunday (the camping weekend).
    const start = new Date(first);
    while (start.getUTCDay() !== 5) start.setUTCDate(start.getUTCDate() + 1); // 5 = Friday
    const startIso = start.toISOString().slice(0, 10);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 2); // Sunday
    const endIso = end.toISOString().slice(0, 10);
    return series.filter((p) => p.night_date >= startIso && p.night_date <= endIso);
  }

  if (key === "month") {
    // From the first available night to the end of THAT calendar month.
    const endOfMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const endIso = endOfMonth.toISOString().slice(0, 10);
    return series.filter((p) => p.night_date <= endIso);
  }

  if (key === "summer") {
    // Through to August 31 of the first year in the window. Most ON parks
    // wind down by Labour Day; we round up to end-of-Aug for simplicity.
    const summerEnd = new Date(Date.UTC(first.getUTCFullYear(), 7, 31)); // 7 = August
    const endIso = summerEnd.toISOString().slice(0, 10);
    return series.filter((p) => p.night_date <= endIso);
  }
  return series;
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

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
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

export function AnalyticsView({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const { totals, statusBreakdown, operators, regions, siteTypes, leaderboard, electric, timeSeries } = snapshot;
  const [period, setPeriod] = useState<PeriodKey>("tonight");

  const periodSeries = useMemo(() => sliceForPeriod(timeSeries, period), [timeSeries, period]);

  // Site-nights inside the selected period
  const periodNights = periodSeries.reduce(
    (acc, p) => {
      acc.available += p.available;
      acc.reserved += p.reserved;
      acc.closed += p.closed;
      acc.total += p.total_sampled;
      return acc;
    },
    { available: 0, reserved: 0, closed: 0, total: 0 },
  );

  // For the headline numbers we mostly care about how many *sites* a user
  // could actually book during the period. For single-night periods that's
  // exactly `periodSeries[0].available`. For multi-night periods we report
  // the median, which approximates "how many sites are available on a
  // typical night in this range".
  const sitesAvailableInPeriod = (() => {
    if (periodSeries.length === 0) return 0;
    if (periodSeries.length === 1) return periodSeries[0].available;
    const sorted = [...periodSeries].map((p) => p.available).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  })();
  const sitesBookedInPeriod = (() => {
    if (periodSeries.length === 0) return 0;
    if (periodSeries.length === 1) return periodSeries[0].reserved;
    const sorted = [...periodSeries].map((p) => p.reserved).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  })();
  const sitesAvailPct = totals.sites > 0 ? Math.round((sitesAvailableInPeriod / totals.sites) * 100) : 0;
  const sitesBookedPct = totals.sites > 0 ? Math.round((sitesBookedInPeriod / totals.sites) * 100) : 0;

  const periodRangeLabel = (() => {
    if (periodSeries.length === 0) return "no data";
    if (periodSeries.length === 1) return fmtDate(periodSeries[0].night_date);
    return `${fmtDate(periodSeries[0].night_date)} – ${fmtDate(periodSeries[periodSeries.length - 1].night_date)}`;
  })();

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "Selected window";

  const operatorStacked = operators.map((o) => ({
    name: o.operator.replace(/ Region CA$/, " CA").replace(/ Peninsula CA$/, " CA"),
    Available: o.available,
    Reserved: o.reserved,
    Closed: o.closed,
    operator_id: o.operator_id,
  }));
  const regionStacked = regions.map((r) => ({
    name: r.region,
    Available: r.available,
    Booked: r.total_sites - r.available,
    pct: r.total_sites > 0 ? Math.round((r.available / r.total_sites) * 100) : 0,
  }));

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
          {periodLabel} · <span className="text-stone-700">{periodRangeLabel}</span>
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
          title={periodSeries.length <= 1 ? "Sites available" : "Sites available (median night)"}
          value={fmt(sitesAvailableInPeriod)}
          sub={`${sitesAvailPct}% of indexed sites · ${periodLabel.toLowerCase()}`}
          accent="emerald"
        />
        <Stat
          icon={Flame}
          title={periodSeries.length <= 1 ? "Sites booked" : "Sites booked (median night)"}
          value={fmt(sitesBookedInPeriod)}
          sub={`${sitesBookedPct}% of indexed sites · ${periodLabel.toLowerCase()}`}
          accent="red"
        />
        <Stat
          icon={Tent}
          title="Site-nights in window"
          value={fmt(periodNights.total)}
          sub={`${fmt(periodNights.available)} bookable nights across ${periodSeries.length} ${
            periodSeries.length === 1 ? "night" : "nights"
          }`}
          accent="amber"
        />
      </div>

      {/* Stacked sites-over-time area chart. Across the selected period,
       *  shows site count broken down by status per night.
       */}
      {periodSeries.length > 1 && (
        <section className="mt-8 card p-5">
          <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Sites available over time</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Stacked count of every indexed site by status, night-by-night across {periodLabel.toLowerCase()}
                ({periodRangeLabel}).
              </p>
            </div>
            <div className="text-xs text-stone-600">
              <span className="font-semibold text-stone-900">
                {periodNights.total > 0 ? Math.round((periodNights.available / periodNights.total) * 100) : 0}%
              </span>{" "}
              avg openness
            </div>
          </div>
          <div className="h-80 mt-4 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={periodSeries} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
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
                  interval={Math.max(0, Math.floor(periodSeries.length / 8))}
                />
                <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                <Area type="monotone" stackId="1" dataKey="available" name="Available" stroke="#059669" strokeWidth={1} fill="url(#g-av)" />
                <Area type="monotone" stackId="1" dataKey="reserved"  name="Reserved"  stroke="#b91c1c" strokeWidth={1} fill="url(#g-re)" />
                <Area type="monotone" stackId="1" dataKey="closed"    name="Closed"    stroke="#57534e" strokeWidth={1} fill="url(#g-cl)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {periodSeries.length === 1 && (
        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold tracking-tight">Tonight at a glance</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Single-night snapshot for {periodRangeLabel}. Pick a wider window for the over-time chart.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg p-4 bg-emerald-50 ring-1 ring-emerald-200">
              <div className="text-emerald-700 uppercase text-[10px] font-semibold tracking-wide">Available</div>
              <div className="text-2xl font-semibold text-stone-900 tabular-nums mt-1">{fmt(periodNights.available)}</div>
              <div className="text-xs text-stone-500 mt-0.5">sites bookable</div>
            </div>
            <div className="rounded-lg p-4 bg-red-50 ring-1 ring-red-200">
              <div className="text-red-700 uppercase text-[10px] font-semibold tracking-wide">Reserved</div>
              <div className="text-2xl font-semibold text-stone-900 tabular-nums mt-1">{fmt(periodNights.reserved)}</div>
              <div className="text-xs text-stone-500 mt-0.5">sites taken</div>
            </div>
            <div className="rounded-lg p-4 bg-stone-100 ring-1 ring-stone-200">
              <div className="text-stone-700 uppercase text-[10px] font-semibold tracking-wide">Closed</div>
              <div className="text-2xl font-semibold text-stone-900 tabular-nums mt-1">{fmt(periodNights.closed)}</div>
              <div className="text-xs text-stone-500 mt-0.5">seasonal / unbookable</div>
            </div>
          </div>
        </section>
      )}

      {/* Per-operator stacked */}
      <section className="mt-6 card p-5">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Booking pressure by network</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Each network&apos;s sites split by current status. Reflects the first bookable night.
            </p>
          </div>
        </div>
        <div className="h-72 mt-4 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={operatorStacked} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 4 }}>
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

      {/* Region availability + status donut */}
      <section className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight">Availability by region</h2>
          <p className="text-xs text-stone-500 mt-0.5">How many of each region&apos;s sites are bookable on the first night.</p>
          <div className="h-64 mt-4 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionStacked} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
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
          <p className="text-xs text-stone-500 mt-0.5">Across all {fmt(totals.sites)} indexed sites.</p>
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusBreakdown.map((s) => ({ name: s.status, value: s.count }))}
                  dataKey="value"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {statusBreakdown.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#a8a29e"} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            {statusBreakdown.map((s) => (
              <div key={s.status} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] ?? "#a8a29e" }} />
                  <span className="capitalize text-stone-700">{s.status}</span>
                </span>
                <span className="font-medium text-stone-900 tabular-nums">{fmt(s.count)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Site type breakdown + Electric vs non */}
      <section className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight">What kinds of sites?</h2>
          <p className="text-xs text-stone-500 mt-0.5">Operator-reported site type, every entry in the index.</p>
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

      {/* Leaderboards */}
      <section className="mt-6 grid lg:grid-cols-2 gap-6">
        <Leaderboard
          title="Most available right now"
          subtitle="Parks with the largest share of bookable sites"
          icon={TrendingUp}
          accent="emerald"
          rows={leaderboard.mostAvailable}
        />
        <Leaderboard
          title="Most booked"
          subtitle="Parks where almost everything is taken"
          icon={TrendingDown}
          accent="red"
          rows={leaderboard.mostBooked}
        />
      </section>

      <p className="mt-10 text-xs text-stone-500 leading-relaxed">
        Sources: Ontario Parks (Camis5), Parks Canada (PCRSv3), and the GoingToCamp-backed Conservation Authorities,
        polled live for this snapshot. <Link href="/freshness" className="text-forest-700 hover:underline">See data freshness</Link>{" "}
        for per-operator update times.
      </p>
    </div>
  );
}

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
        {rows.map((r, i) => {
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
              <Link
                href={`/park/${r.slug}`}
                className="flex-1 truncate text-sm text-stone-800 hover:text-forest-700"
              >
                {r.name}
              </Link>
              <span className="text-xs text-stone-500 truncate hidden sm:inline">{r.region}</span>
              <span className={`text-sm font-semibold tabular-nums ${pctColor}`}>{r.availability_pct}%</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
