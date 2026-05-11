"use client";
import Link from "next/link";
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
  ReferenceLine,
} from "recharts";
import type { AnalyticsSnapshot } from "@/lib/analytics";
import { Activity, Database, MapPin, Flame, Zap, TrendingUp, TrendingDown, Clock } from "lucide-react";

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

export function AnalyticsView({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const { totals, statusBreakdown, operators, regions, siteTypes, leaderboard, electric, timeSeries } = snapshot;
  const availPct = totals.sites > 0 ? Math.round((totals.available / totals.sites) * 100) : 0;
  const reservedPct = totals.sites > 0 ? Math.round((totals.reserved / totals.sites) * 100) : 0;
  const closedPct = totals.sites > 0 ? Math.round((totals.closed / totals.sites) * 100) : 0;

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

  // Top 10 site types — anything past 10 → "Other"
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
            Live booking pressure across every operator we index. Updated{" "}
            <span className="font-medium text-stone-900">{formatRelative(snapshot.generated_at)}</span>.
          </p>
        </div>
        <Link
          href="/search"
          className="btn-primary"
        >
          Search available sites →
        </Link>
      </div>

      {/* Headline cards */}
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Database} title="Sites indexed" value={fmt(totals.sites)} sub={`${fmt(totals.parks)} parks · ${fmt(totals.operators)} operators`} />
        <Stat
          icon={TrendingUp}
          title="Available now"
          value={fmt(totals.available)}
          sub={`${availPct}% of the index · open to book`}
          accent="emerald"
        />
        <Stat
          icon={Flame}
          title="Reserved"
          value={fmt(totals.reserved)}
          sub={`${reservedPct}% of the index · booked in window`}
          accent="red"
        />
        <Stat
          icon={Clock}
          title="Closed / seasonal"
          value={fmt(totals.closed)}
          sub={`${closedPct}% of the index · not currently bookable`}
          accent="stone"
        />
      </div>

      {/* Time series — booking pressure across the future window */}
      {timeSeries.length > 1 && (
        <section className="mt-10 card p-5">
          <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Booking pressure across the window</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                One representative site sampled per park (n = {timeSeries[0]?.total_sampled ?? 0}), per-night availability
                across {timeSeries.length} days. Higher peaks = more parks open that night.
              </p>
            </div>
            <div className="text-xs text-stone-600">
              <span className="font-semibold text-stone-900">
                {Math.round(
                  (timeSeries.reduce((sum, p) => sum + p.available, 0) /
                    Math.max(timeSeries.reduce((sum, p) => sum + p.total_sampled, 0), 1)) * 100,
                )}%
              </span>{" "}
              avg openness over window
            </div>
          </div>
          <div className="h-72 mt-4 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="avAvail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  dataKey="night_date"
                  tick={{ fontSize: 10, fill: "#78716c" }}
                  tickFormatter={(v) => {
                    const d = new Date(v + "T00:00:00Z");
                    return `${d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })}`;
                  }}
                  interval={Math.max(0, Math.floor(timeSeries.length / 8))}
                />
                <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip content={<TimeSeriesTooltip />} />
                <ReferenceLine
                  x={timeSeries[0]?.night_date}
                  stroke="#a8a29e"
                  strokeDasharray="3 3"
                  label={{ value: "window start", fontSize: 10, fill: "#78716c", position: "insideTopLeft" }}
                />
                <Area type="monotone" dataKey="available" stroke="#059669" strokeWidth={2} fill="url(#avAvail)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Per-operator stacked */}
      <section className="mt-6 card p-5">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Booking pressure by operator</h2>
            <p className="text-xs text-stone-500 mt-0.5">Stack shows every site under that operator coloured by current status.</p>
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
              <Bar dataKey="Available" stackId="s" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Reserved"  stackId="s" fill="#ef4444" />
              <Bar dataKey="Closed"    stackId="s" fill="#991b1b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Region availability + status donut */}
      <section className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight">Availability by region</h2>
          <p className="text-xs text-stone-500 mt-0.5">How many of each region&apos;s sites are bookable right now.</p>
          <div className="h-64 mt-4 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionStacked} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#78716c" }} interval={0} angle={-15} textAnchor="end" height={56} />
                <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Available" stackId="s" fill="#10b981" />
                <Bar dataKey="Booked"    stackId="s" fill="#ef4444" />
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

      {/* Footnote */}
      <p className="mt-10 text-xs text-stone-500 leading-relaxed">
        Sources: Ontario Parks (Camis5), Parks Canada (PCRSv3), and six GoingToCamp-backed Conservation Authorities,
        polled live for this snapshot. <Link href="/freshness" className="text-forest-700 hover:underline">See data freshness</Link>{" "}
        for per-operator update times. Per-night precision varies — these counts reflect each site&apos;s status across our 90-day forward window.
      </p>
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
  icon: typeof Activity;
  title: string;
  value: string;
  sub: string;
  accent?: "emerald" | "red" | "stone";
}) {
  const ring =
    accent === "emerald"
      ? "ring-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white"
      : accent === "red"
      ? "ring-red-200/60 bg-gradient-to-br from-red-50 to-white"
      : accent === "stone"
      ? "ring-stone-200 bg-gradient-to-br from-stone-50 to-white"
      : "ring-stone-200";
  const iconBg =
    accent === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : accent === "red"
      ? "bg-red-100 text-red-700"
      : accent === "stone"
      ? "bg-stone-200 text-stone-700"
      : "bg-forest-100 text-forest-700";
  return (
    <div className={`card p-5 ${ring}`}>
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon size={18} />
      </div>
      <div className="mt-3 text-xs text-stone-500 uppercase tracking-wide">{title}</div>
      <div className="text-3xl font-semibold mt-0.5 tabular-nums">{value}</div>
      <div className="text-xs text-stone-500 mt-1 leading-relaxed">{sub}</div>
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
  icon: typeof Activity;
  accent: "emerald" | "red";
  rows: AnalyticsSnapshot["leaderboard"]["mostAvailable"];
}) {
  const fill = accent === "emerald" ? "#10b981" : "#ef4444";
  const text = accent === "emerald" ? "text-emerald-700" : "text-red-700";
  return (
    <div className="card p-5">
      <div className="flex items-baseline gap-2">
        <Icon size={16} className={text} />
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
      <ul className="mt-4 space-y-2">
        {rows.map((p, i) => (
          <li key={p.slug} className="flex items-center gap-3">
            <span className="w-5 text-xs text-stone-400 tabular-nums shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <Link href={`/park/${p.slug}`} className="text-sm font-medium text-stone-900 hover:text-forest-700 truncate block">
                {p.name}
              </Link>
              <div className="text-[11px] text-stone-500 truncate">
                {p.operator} · {p.region}
              </div>
            </div>
            <div className="text-xs text-stone-600 tabular-nums shrink-0 text-right min-w-[120px]">
              <div className="flex items-center gap-2 justify-end">
                <span className="text-stone-500">{fmt(p.available)} / {fmt(p.total_sites)}</span>
                <span
                  className="font-semibold tabular-nums w-9 text-right"
                  style={{ color: fill }}
                >
                  {p.availability_pct}%
                </span>
              </div>
              <div className="mt-1 h-1 w-full bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${p.availability_pct}%`, backgroundColor: fill }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimeSeriesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { total_sampled?: number; reserved?: number } }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  const total = p.payload?.total_sampled ?? 0;
  const avail = p.value ?? 0;
  const pct = total > 0 ? Math.round((avail / total) * 100) : 0;
  const d = label ? new Date(label + "T00:00:00Z") : null;
  return (
    <div className="bg-white ring-1 ring-stone-200 shadow-md rounded-md px-3 py-2 text-xs">
      {d && (
        <div className="font-semibold text-stone-900 mb-1">
          {d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
        </div>
      )}
      <div className="flex items-center gap-2 text-stone-700">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        <span>Available: <span className="font-medium tabular-nums">{avail.toLocaleString()}</span> of {total.toLocaleString()} ({pct}%)</span>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { name?: string } }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const heading = label || payload[0]?.payload?.name || payload[0]?.name;
  return (
    <div className="bg-white ring-1 ring-stone-200 shadow-md rounded-md px-3 py-2 text-xs">
      {heading && <div className="font-semibold text-stone-900 mb-1">{heading}</div>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-stone-700">
          <span>{entry.name}:</span>
          <span className="font-medium tabular-nums">{(entry.value ?? 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
