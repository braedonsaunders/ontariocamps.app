"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Calendar,
  CalendarDays,
  Compass,
  Database,
  Flame,
  Gauge,
  Info,
  MapPinned,
  Moon,
  Search,
  Tent,
  TrendingDown,
  TrendingUp,
  Trees,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AnalyticsSnapshot, ParkNightSeries } from "@/lib/analytics";

const STATUS_COLORS: Record<string, string> = {
  available: "#10b981",
  reserved: "#ef4444",
  closed: "#57534e",
  unknown: "#a8a29e",
};

const INVENTORY_PALETTE = [
  "#37562e",
  "#308ea6",
  "#f59e0b",
  "#7ba36b",
  "#2b5d72",
  "#ef4444",
  "#88cad9",
  "#a16207",
  "#78716c",
  "#5a8849",
];

type PeriodKey = "tonight" | "weekend" | "month" | "season";
type Tone = "emerald" | "amber" | "red" | "lake" | "stone";

const PERIODS: Array<{
  key: PeriodKey;
  label: string;
  eyebrow: string;
  icon: LucideIcon;
}> = [
  { key: "tonight", label: "Tonight", eyebrow: "Single-night odds", icon: Moon },
  { key: "weekend", label: "This weekend", eyebrow: "Fri-Sun pressure", icon: CalendarDays },
  { key: "month", label: "This month", eyebrow: "Near-term planning", icon: Calendar },
  { key: "season", label: "This season", eyebrow: "Full camping window", icon: Trees },
];

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-CA");
}

function fmtCompact(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    notation: "compact",
    maximumFractionDigits: n >= 1000 ? 1 : 0,
  }).format(n);
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
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

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[idx];
}

function rangeLabel(start: string, end: string): string {
  return start === end ? fmtDate(start) : `${fmtDate(start)} - ${fmtDate(end)}`;
}

function searchUrlForSeries(series: NightPoint[]): string {
  if (series.length === 0) return "/search";
  const start = series[0].night_date;
  const end = addDaysIso(series[series.length - 1].night_date, 1);
  const sp = new URLSearchParams({
    start_date: start,
    end_date: end,
    flexible: "true",
    sort: "freshness",
  });
  return `/search?${sp.toString()}`;
}

function compactOperatorName(name: string): string {
  return name.replace(/ Region CA$/, " CA").replace(/ Peninsula CA$/, " CA");
}

/**
 * Resolve a period to an index range [from, to] into the parkNightSeries.dates
 * array. Returns null if the data window does not cover the requested period.
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
    end.setUTCDate(end.getUTCDate() + 2);
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
    const seasonEnd = new Date(Date.UTC(first.getUTCFullYear(), 9, 31));
    const endIso = seasonEnd.toISOString().slice(0, 10);
    let to = 0;
    for (let i = 0; i < dates.length; i++) if (dates[i] <= endIso) to = i;
    return { from: 0, to };
  }

  return null;
}

function sumRange(arr: number[], from: number, to: number): number {
  let s = 0;
  for (let i = from; i <= to; i++) s += arr[i] ?? 0;
  return s;
}

function medianRange(arr: number[], from: number, to: number): number {
  if (from > to) return 0;
  return median(arr.slice(from, to + 1));
}

function buildLookaheadSeries(pns: ParkNightSeries, days = 31): NightPoint[] {
  if (pns.dates.length === 0) return [];
  const to = Math.min(pns.dates.length - 1, days - 1);
  return pns.dates.slice(0, to + 1).map((d, i) => {
    let available = 0;
    let reserved = 0;
    let closed = 0;
    for (const p of pns.parks) {
      available += p.available[i] ?? 0;
      reserved += p.reserved[i] ?? 0;
      closed += p.closed[i] ?? 0;
    }
    const total = available + reserved + closed;
    return { night_date: d, available, reserved, closed, total, openness_pct: pct(available, total) };
  });
}

type NightPoint = {
  night_date: string;
  available: number;
  reserved: number;
  closed: number;
  total: number;
  openness_pct: number;
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

type HeatmapBucket = {
  label: string;
  range: string;
  from: number;
  to: number;
  days: number;
};

type HeatmapRow = {
  region: string;
  totalSites: number;
  cells: Array<{
    label: string;
    pct: number;
    available: number;
    totalSites: number;
  }>;
};

type PeriodAggregates = {
  series: NightPoint[];
  nightSums: { available: number; reserved: number; closed: number; total: number };
  operators: Array<{
    name: string;
    operator_id: string;
    Available: number;
    Reserved: number;
    Closed: number;
    total: number;
    pct: number;
    pressurePct: number;
  }>;
  regions: Array<{ name: string; Available: number; Booked: number; totalSites: number; pct: number }>;
  statusMix: Array<{ name: string; value: number }>;
  mostAvailable: LeaderRow[];
  mostBooked: LeaderRow[];
  rangeLabel: string;
  daysInWindow: number;
  fromIndex: number;
  toIndex: number;
  medianAvailable: number;
  medianReserved: number;
  bestNight: NightPoint | null;
  hardestNight: NightPoint | null;
  heatmap: { buckets: HeatmapBucket[]; rows: HeatmapRow[] };
  distribution: {
    parksAnalyzed: number;
    medianParkPct: number;
    openParks: number;
    tightParks: number;
    soldOutParks: number;
    p10Night: number;
    p90Night: number;
  };
};

function buildHeatmap(pns: ParkNightSeries, from: number, to: number): { buckets: HeatmapBucket[]; rows: HeatmapRow[] } {
  const nights = to - from + 1;
  const bucketSize = nights <= 10 ? 1 : nights <= 45 ? 3 : 7;
  const buckets: HeatmapBucket[] = [];

  for (let start = from; start <= to; start += bucketSize) {
    const end = Math.min(to, start + bucketSize - 1);
    buckets.push({
      label: start === end ? fmtDate(pns.dates[start]) : fmtDate(pns.dates[start]),
      range: rangeLabel(pns.dates[start], pns.dates[end]),
      from: start,
      to: end,
      days: end - start + 1,
    });
  }

  const byRegion = new Map<
    string,
    { totalSites: number; available: number[]; sampled: number[] }
  >();

  for (const p of pns.parks) {
    const region = p.region?.trim() || "Unknown";
    let acc = byRegion.get(region);
    if (!acc) {
      acc = {
        totalSites: 0,
        available: new Array(buckets.length).fill(0),
        sampled: new Array(buckets.length).fill(0),
      };
      byRegion.set(region, acc);
    }
    acc.totalSites += p.total_sites;
    buckets.forEach((b, bucketIndex) => {
      acc!.available[bucketIndex] += sumRange(p.available, b.from, b.to);
      acc!.sampled[bucketIndex] += p.total_sites * b.days;
    });
  }

  const rows = Array.from(byRegion.entries())
    .map(([region, acc]) => ({
      region,
      totalSites: acc.totalSites,
      cells: buckets.map((b, i) => ({
        label: b.range,
        pct: pct(acc.available[i], acc.sampled[i]),
        available: Math.round(acc.available[i] / Math.max(1, b.days)),
        totalSites: acc.totalSites,
      })),
    }))
    .sort((a, b) => b.totalSites - a.totalSites)
    .slice(0, 10);

  return { buckets, rows };
}

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
      fromIndex: 0,
      toIndex: -1,
      medianAvailable: 0,
      medianReserved: 0,
      bestNight: null,
      hardestNight: null,
      heatmap: { buckets: [], rows: [] },
      distribution: {
        parksAnalyzed: 0,
        medianParkPct: 0,
        openParks: 0,
        tightParks: 0,
        soldOutParks: 0,
        p10Night: 0,
        p90Night: 0,
      },
    };
  }

  const { from, to } = range;
  const daysInWindow = to - from + 1;

  const series = pns.dates.slice(from, to + 1).map((d, idx) => {
    const i = from + idx;
    let available = 0;
    let reserved = 0;
    let closed = 0;
    for (const p of pns.parks) {
      available += p.available[i] ?? 0;
      reserved += p.reserved[i] ?? 0;
      closed += p.closed[i] ?? 0;
    }
    const total = available + reserved + closed;
    return { night_date: d, available, reserved, closed, total, openness_pct: pct(available, total) };
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

  const operatorMap = new Map<
    string,
    { name: string; available: number[]; reserved: number[]; closed: number[] }
  >();
  for (const p of pns.parks) {
    let acc = operatorMap.get(p.operator_id);
    if (!acc) {
      acc = {
        name: p.operator,
        available: new Array(daysInWindow).fill(0),
        reserved: new Array(daysInWindow).fill(0),
        closed: new Array(daysInWindow).fill(0),
      };
      operatorMap.set(p.operator_id, acc);
    }
    for (let i = 0; i < daysInWindow; i++) {
      acc.available[i] += p.available[from + i] ?? 0;
      acc.reserved[i] += p.reserved[from + i] ?? 0;
      acc.closed[i] += p.closed[from + i] ?? 0;
    }
  }

  const operators = Array.from(operatorMap.entries())
    .map(([operator_id, agg]) => {
      const Available = medianRange(agg.available, 0, daysInWindow - 1);
      const Reserved = medianRange(agg.reserved, 0, daysInWindow - 1);
      const Closed = medianRange(agg.closed, 0, daysInWindow - 1);
      const total = Available + Reserved + Closed;
      const pressurePct = pct(Reserved, Available + Reserved);
      return {
        operator_id,
        name: compactOperatorName(agg.name),
        Available,
        Reserved,
        Closed,
        total,
        pct: pct(Available, total),
        pressurePct,
      };
    })
    .sort((a, b) => b.pressurePct - a.pressurePct || b.total - a.total);

  const regionMap = new Map<string, { totalSites: number; available: number[] }>();
  for (const p of pns.parks) {
    const region = p.region?.trim() || "Unknown";
    let acc = regionMap.get(region);
    if (!acc) {
      acc = { totalSites: 0, available: new Array(daysInWindow).fill(0) };
      regionMap.set(region, acc);
    }
    acc.totalSites += p.total_sites;
    for (let i = 0; i < daysInWindow; i++) acc.available[i] += p.available[from + i] ?? 0;
  }

  const regions = Array.from(regionMap.entries())
    .map(([name, agg]) => {
      const Available = medianRange(agg.available, 0, daysInWindow - 1);
      return {
        name,
        Available,
        Booked: Math.max(0, agg.totalSites - Available),
        totalSites: agg.totalSites,
        pct: pct(Available, agg.totalSites),
      };
    })
    .sort((a, b) => b.pct - a.pct || b.Available - a.Available);

  const statusMix = [
    { name: "available", value: nightSums.available },
    { name: "reserved", value: nightSums.reserved },
    { name: "closed", value: nightSums.closed },
  ];

  const parkRanks: LeaderRow[] = pns.parks
    .filter((p) => p.total_sites >= 5)
    .map((p) => {
      const available = medianRange(p.available, from, to);
      return {
        slug: p.slug,
        name: p.name,
        operator: p.operator,
        operator_id: p.operator_id,
        region: p.region ?? "",
        total_sites: p.total_sites,
        available,
        availability_pct: pct(available, p.total_sites),
      };
    });

  const mostAvailable = [...parkRanks]
    .sort((a, b) => b.availability_pct - a.availability_pct || b.total_sites - a.total_sites)
    .slice(0, 12);

  const mostBooked = [...parkRanks]
    .sort((a, b) => a.availability_pct - b.availability_pct || b.total_sites - a.total_sites)
    .slice(0, 12);

  const nightAvailability = series.map((p) => p.available);
  const parkPctValues = parkRanks.map((p) => p.availability_pct);
  const bestNight = series.length ? series.reduce((best, p) => (p.available > best.available ? p : best), series[0]) : null;
  const hardestNight = series.length ? series.reduce((hardest, p) => (p.available < hardest.available ? p : hardest), series[0]) : null;

  return {
    series,
    nightSums,
    operators,
    regions,
    statusMix,
    mostAvailable,
    mostBooked,
    rangeLabel: series.length ? rangeLabel(series[0].night_date, series[series.length - 1].night_date) : "no data",
    daysInWindow,
    fromIndex: from,
    toIndex: to,
    medianAvailable: median(nightAvailability),
    medianReserved: median(series.map((p) => p.reserved)),
    bestNight,
    hardestNight,
    heatmap: buildHeatmap(pns, from, to),
    distribution: {
      parksAnalyzed: parkRanks.length,
      medianParkPct: median(parkPctValues),
      openParks: parkRanks.filter((p) => p.availability_pct >= 50).length,
      tightParks: parkRanks.filter((p) => p.availability_pct <= 10).length,
      soldOutParks: parkRanks.filter((p) => p.available === 0).length,
      p10Night: quantile(nightAvailability, 0.1),
      p90Night: quantile(nightAvailability, 0.9),
    },
  };
}

function pressureTone(pressurePct: number): Tone {
  if (pressurePct >= 88) return "red";
  if (pressurePct >= 74) return "amber";
  if (pressurePct >= 55) return "lake";
  return "emerald";
}

function pressureLabel(pressurePct: number): string {
  if (pressurePct >= 88) return "Very tight";
  if (pressurePct >= 74) return "Busy";
  if (pressurePct >= 55) return "Competitive";
  return "Roomy";
}

function heatColor(value: number): string {
  if (value >= 55) return "#047857";
  if (value >= 35) return "#10b981";
  if (value >= 20) return "#f59e0b";
  if (value >= 10) return "#ef4444";
  return "#7f1d1d";
}

function toneClasses(tone: Tone): {
  shell: string;
  icon: string;
  text: string;
  soft: string;
  bar: string;
} {
  if (tone === "emerald") {
    return {
      shell: "ring-emerald-200 bg-emerald-50",
      icon: "bg-emerald-100 text-emerald-700 ring-emerald-200",
      text: "text-emerald-700",
      soft: "bg-emerald-100 text-emerald-800 ring-emerald-200",
      bar: "bg-emerald-500",
    };
  }
  if (tone === "amber") {
    return {
      shell: "ring-amber-200 bg-amber-50",
      icon: "bg-amber-100 text-amber-700 ring-amber-200",
      text: "text-amber-700",
      soft: "bg-amber-100 text-amber-800 ring-amber-200",
      bar: "bg-amber-500",
    };
  }
  if (tone === "red") {
    return {
      shell: "ring-red-200 bg-red-50",
      icon: "bg-red-100 text-red-700 ring-red-200",
      text: "text-red-700",
      soft: "bg-red-100 text-red-800 ring-red-200",
      bar: "bg-red-500",
    };
  }
  if (tone === "lake") {
    return {
      shell: "ring-lake-200 bg-lake-50",
      icon: "bg-lake-100 text-lake-700 ring-lake-200",
      text: "text-lake-700",
      soft: "bg-lake-100 text-lake-800 ring-lake-200",
      bar: "bg-lake-500",
    };
  }
  return {
    shell: "ring-stone-200 bg-white",
    icon: "bg-stone-100 text-stone-600 ring-stone-200",
    text: "text-stone-700",
    soft: "bg-stone-100 text-stone-700 ring-stone-200",
    bar: "bg-stone-500",
  };
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
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-stone-200">
      {fmtLabel && <div className="mb-1 font-semibold text-stone-950">{fmtLabel}</div>}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-stone-600">{p.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-stone-950">{fmt(Number(p.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeriodTabs({ value, onChange }: { value: PeriodKey; onChange: (k: PeriodKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PERIODS.map((p) => {
        const Icon = p.icon;
        const active = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ring-1 transition-colors ${
              active
                ? "bg-forest-700 text-white shadow-sm ring-forest-700"
                : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50 hover:text-stone-950"
            }`}
          >
            <Icon size={14} />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "stone",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone?: Tone;
}) {
  const c = toneClasses(tone);
  return (
    <div className={`relative overflow-hidden rounded-lg p-3 ring-1 ${c.shell}`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 ${c.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-stone-950">{value}</div>
        </div>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ring-1 ${c.icon}`}>
          <Icon size={14} />
        </span>
      </div>
      <div className="mt-1.5 text-xs leading-snug text-stone-600">{sub}</div>
    </div>
  );
}

function InsightCard({
  icon: Icon,
  label,
  title,
  body,
  href,
  cta,
  tone = "stone",
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
  href?: string;
  cta?: string;
  tone?: Tone;
}) {
  const c = toneClasses(tone);
  const content = (
    <>
      <div className="flex items-start gap-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ring-1 ${c.icon}`}>
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug text-stone-950">{title}</h3>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-stone-600">{body}</p>
      {href && cta && (
        <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold ${c.text}`}>
          {cta} <ArrowUpRight size={12} />
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`block rounded-lg p-3 ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md ${c.shell}`}>
        {content}
      </Link>
    );
  }

  return <div className={`rounded-lg p-3 ring-1 ${c.shell}`}>{content}</div>;
}

function SectionHeader({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{eyebrow}</div>}
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-stone-950">{title}</h2>
        {body && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-600">{body}</p>}
      </div>
      {action}
    </div>
  );
}

function TonightSnapshot({ agg }: { agg: PeriodAggregates }) {
  const items = [
    { label: "Available", value: agg.nightSums.available, tone: "emerald" as Tone },
    { label: "Reserved", value: agg.nightSums.reserved, tone: "red" as Tone },
    { label: "Closed", value: agg.nightSums.closed, tone: "stone" as Tone },
  ];

  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-stone-200 shadow-sm">
      <SectionHeader
        eyebrow="Single night"
        title="Tonight at a glance"
        body={`A live snapshot for ${agg.rangeLabel}. Switch windows for the night-by-night pressure curve.`}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const c = toneClasses(item.tone);
          return (
            <div key={item.label} className={`rounded-lg p-4 ring-1 ${c.shell}`}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${c.text}`}>{item.label}</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-stone-950">{fmt(item.value)}</div>
              <div className="mt-1 text-xs text-stone-500">{pct(item.value, agg.nightSums.total)}% of tonight&apos;s sampled sites</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PressureOverviewChart({ series }: { series: NightPoint[] }) {
  if (series.length === 0) return null;
  const sums = series.reduce(
    (acc, p) => {
      acc.available += p.available;
      acc.reserved += p.reserved;
      acc.closed += p.closed;
      acc.total += p.total;
      return acc;
    },
    { available: 0, reserved: 0, closed: 0, total: 0 },
  );
  const today = series[0].night_date;
  const label = rangeLabel(series[0].night_date, series[series.length - 1].night_date);

  return (
    <section className="border-y border-stone-200 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Date pressure</div>
          <h2 className="text-base font-semibold tracking-tight text-stone-950">Next 31 nights</h2>
          <span className="text-xs text-stone-500">{label}</span>
        </div>
        <div className="rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-200">
          {pct(sums.available, sums.total)}% open site-nights
        </div>
      </div>
      <div className="mt-2 h-48 min-w-0 -ml-2 sm:h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pressure-available" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.72} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.28} />
              </linearGradient>
              <linearGradient id="pressure-reserved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.66} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.28} />
              </linearGradient>
              <linearGradient id="pressure-closed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#78716c" stopOpacity={0.62} />
                <stop offset="100%" stopColor="#78716c" stopOpacity={0.24} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis
              dataKey="night_date"
              interval={Math.max(0, Math.floor(series.length / 7))}
              tick={{ fontSize: 10, fill: "#78716c" }}
              tickFormatter={(v) => fmtDate(v)}
            />
            <YAxis tick={{ fontSize: 10, fill: "#78716c" }} tickFormatter={(v) => fmtCompact(Number(v))} width={34} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine
              x={today}
              stroke="#37562e"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: "Today", position: "insideTopLeft", fill: "#37562e", fontSize: 11 }}
            />
            <Area
              type="monotone"
              stackId="1"
              dataKey="available"
              name="Available"
              stroke="#059669"
              strokeWidth={1}
              fill="url(#pressure-available)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              stackId="1"
              dataKey="reserved"
              name="Reserved"
              stroke="#b91c1c"
              strokeWidth={1}
              fill="url(#pressure-reserved)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              stackId="1"
              dataKey="closed"
              name="Closed"
              stroke="#57534e"
              strokeWidth={1}
              fill="url(#pressure-closed)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function AvailabilityChart({ agg, periodLabel }: { agg: PeriodAggregates; periodLabel: string }) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-stone-200 shadow-sm">
      <SectionHeader
        eyebrow="Date pressure"
        title="Sites by night"
        body={`Every indexed site split by status across ${periodLabel.toLowerCase()} (${agg.rangeLabel}).`}
        action={
          <div className="rounded-md bg-stone-100 px-2.5 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-200">
            {pct(agg.nightSums.available, agg.nightSums.total)}% open site-nights
          </div>
        }
      />
      <div className="mt-4 h-80 min-w-0 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={agg.series} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="analytics-available" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id="analytics-reserved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.48} />
              </linearGradient>
              <linearGradient id="analytics-closed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#78716c" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#78716c" stopOpacity={0.38} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis
              dataKey="night_date"
              interval={Math.max(0, Math.floor(agg.series.length / 8))}
              tick={{ fontSize: 10, fill: "#78716c" }}
              tickFormatter={(v) => fmtDate(v)}
            />
            <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickFormatter={(v) => fmtCompact(Number(v))} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
            <Area
              type="monotone"
              stackId="1"
              dataKey="available"
              name="Available"
              stroke="#059669"
              strokeWidth={1}
              fill="url(#analytics-available)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              stackId="1"
              dataKey="reserved"
              name="Reserved"
              stroke="#b91c1c"
              strokeWidth={1}
              fill="url(#analytics-reserved)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              stackId="1"
              dataKey="closed"
              name="Closed"
              stroke="#57534e"
              strokeWidth={1}
              fill="url(#analytics-closed)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function NerdPanel({ agg }: { agg: PeriodAggregates }) {
  const spread = Math.max(0, agg.distribution.p90Night - agg.distribution.p10Night);
  return (
    <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200 shadow-sm">
      <SectionHeader
        eyebrow="Distribution"
        title="Data nerd readout"
        body="Median, tails, and park-level scarcity using per-park nightly rollups."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <NerdRow icon={Gauge} label="Median park availability" value={`${agg.distribution.medianParkPct}%`} />
        <NerdRow icon={BadgeCheck} label="Parks at 50%+ availability" value={fmt(agg.distribution.openParks)} />
        <NerdRow icon={Flame} label="Parks at 10% or lower" value={fmt(agg.distribution.tightParks)} />
        <NerdRow icon={BarChart3} label="P10-P90 nightly spread" value={fmt(spread)} />
      </div>
      <div className="mt-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          <Info size={13} /> Typical means median
        </div>
        <p className="mt-2 text-xs leading-relaxed text-stone-600">
          Multi-day windows use median nightly availability so one strange night does not dominate the story.
        </p>
      </div>
    </section>
  );
}

function NerdRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Icon size={13} />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-stone-950">{value}</div>
    </div>
  );
}

function NetworkChart({ agg, periodLabel }: { agg: PeriodAggregates; periodLabel: string }) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-stone-200 shadow-sm">
      <SectionHeader
        eyebrow="Network pressure"
        title="Status split by operator"
        body={`Median nightly site counts across ${periodLabel.toLowerCase()}.`}
      />
      <div className="mt-4 space-y-3">
        {agg.operators.map((op) => {
          const availablePct = pct(op.Available, op.total);
          const reservedPct = pct(op.Reserved, op.total);
          const closedPct = Math.max(0, 100 - availablePct - reservedPct);
          return (
            <Link
              key={op.operator_id}
              href={`/operator/${op.operator_id}`}
              className="block rounded-lg border border-stone-200 p-3 transition-colors hover:bg-stone-50"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-stone-950">{op.name}</div>
                  <div className="mt-0.5 text-xs text-stone-500">{fmt(op.total)} typical sampled sites</div>
                </div>
                <div className="text-sm font-semibold tabular-nums text-red-700">{op.pressurePct}% pressure</div>
              </div>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-stone-100">
                <span className="bg-emerald-500" style={{ width: `${availablePct}%` }} />
                <span className="bg-red-500" style={{ width: `${reservedPct}%` }} />
                <span className="bg-stone-500" style={{ width: `${closedPct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500">
                <span><span className="font-semibold text-emerald-700">{fmt(op.Available)}</span> available</span>
                <span><span className="font-semibold text-red-700">{fmt(op.Reserved)}</span> reserved</span>
                <span><span className="font-semibold text-stone-700">{fmt(op.Closed)}</span> closed</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function RegionBoard({ regions }: { regions: PeriodAggregates["regions"] }) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-stone-200 shadow-sm">
      <SectionHeader
        eyebrow="Regional odds"
        title="Where the openings cluster"
        body="Regions ranked by typical available share."
      />
      <div className="mt-4 space-y-3">
        {regions.slice(0, 9).map((r) => {
          const tone = r.pct >= 45 ? "emerald" : r.pct >= 25 ? "lake" : r.pct >= 12 ? "amber" : "red";
          const c = toneClasses(tone);
          return (
            <div key={r.name} className="rounded-lg border border-stone-200 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-stone-950">{r.name}</div>
                  <div className="mt-0.5 text-xs text-stone-500">
                    {fmt(r.Available)} of {fmt(r.totalSites)} typical sites open
                  </div>
                </div>
                <div className={`text-lg font-semibold tabular-nums ${c.text}`}>{r.pct}%</div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.min(100, Math.max(0, r.pct))}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AvailabilityHeatmap({ agg }: { agg: PeriodAggregates }) {
  if (agg.heatmap.rows.length === 0) return null;

  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-stone-200 shadow-sm">
      <SectionHeader
        eyebrow="Region x date"
        title="Availability heatmap"
        body="Darker green means more openings; red means the region is tight for that bucket."
      />
      <div className="mt-4 overflow-x-auto pb-1">
        <div
          className="grid min-w-[760px] gap-1"
          style={{
            gridTemplateColumns: `minmax(150px, 1.4fr) repeat(${agg.heatmap.buckets.length}, minmax(38px, 1fr))`,
          }}
        >
          <div className="sticky left-0 z-10 bg-white pr-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Region
          </div>
          {agg.heatmap.buckets.map((b) => (
            <div key={`${b.from}-${b.to}`} className="text-center text-[10px] font-medium leading-tight text-stone-500" title={b.range}>
              {b.label}
            </div>
          ))}
          {agg.heatmap.rows.map((row) => (
            <HeatmapRowView key={row.region} row={row} />
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span className="font-medium text-stone-700">Open share</span>
        {[5, 15, 30, 45, 60].map((v) => (
          <span key={v} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: heatColor(v) }} />
            {v}%
          </span>
        ))}
      </div>
    </section>
  );
}

function HeatmapRowView({ row }: { row: HeatmapRow }) {
  return (
    <>
      <div className="sticky left-0 z-10 min-w-0 bg-white py-1.5 pr-2">
        <div className="truncate text-sm font-medium text-stone-900">{row.region}</div>
        <div className="text-[10px] text-stone-500">{fmt(row.totalSites)} sites</div>
      </div>
      {row.cells.map((cell, i) => (
        <div
          key={`${row.region}-${i}`}
          className="grid h-9 place-items-center rounded-md text-[11px] font-semibold text-white shadow-sm"
          title={`${row.region} / ${cell.label}: ${cell.pct}% open (${fmt(cell.available)} typical sites)`}
          style={{ backgroundColor: heatColor(cell.pct) }}
        >
          {cell.pct}
        </div>
      ))}
    </>
  );
}

function StatusMix({ agg, periodLabel }: { agg: PeriodAggregates; periodLabel: string }) {
  return (
    <section className="rounded-lg bg-white p-5 ring-1 ring-stone-200 shadow-sm">
      <SectionHeader
        eyebrow="Window mix"
        title="Site-night status"
        body={`All sampled site-nights across ${periodLabel.toLowerCase()}.`}
      />
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={agg.statusMix} dataKey="value" innerRadius="58%" outerRadius="86%" paddingAngle={2} isAnimationActive={false}>
              {agg.statusMix.map((s) => (
                <Cell key={s.name} fill={STATUS_COLORS[s.name] ?? "#a8a29e"} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <LegendList
        rows={agg.statusMix.map((s) => ({
          label: s.name,
          value: fmt(s.value),
          color: STATUS_COLORS[s.name] ?? "#a8a29e",
        }))}
      />
    </section>
  );
}

function InventoryCharts({
  siteTypePieData,
  electricPieData,
}: {
  siteTypePieData: Array<{ name: string; value: number }>;
  electricPieData: Array<{ name: string; value: number; color: string }>;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-lg bg-white p-5 ring-1 ring-stone-200 shadow-sm lg:col-span-2">
        <SectionHeader
          eyebrow="Inventory"
          title="What kinds of sites exist?"
          body="Operator-reported site types across every indexed campsite."
        />
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={siteTypePieData}
                dataKey="value"
                nameKey="name"
                cx="35%"
                cy="50%"
                innerRadius="42%"
                outerRadius="82%"
                paddingAngle={1.5}
                isAnimationActive={false}
              >
                {siteTypePieData.map((_, i) => (
                  <Cell key={i} fill={INVENTORY_PALETTE[i % INVENTORY_PALETTE.length]} />
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
      <div className="rounded-lg bg-white p-5 ring-1 ring-stone-200 shadow-sm">
        <SectionHeader
          eyebrow="Power"
          title="Electric vs non"
          body="Derived from each site's operator-reported type."
        />
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={electricPieData} dataKey="value" innerRadius="58%" outerRadius="86%" paddingAngle={2} isAnimationActive={false}>
                {electricPieData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <LegendList rows={electricPieData.map((d) => ({ label: d.name, value: fmt(d.value), color: d.color }))} />
      </div>
    </section>
  );
}

function LegendList({ rows }: { rows: Array<{ label: string; value: string; color: string }> }) {
  return (
    <div className="mt-2 space-y-1 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="truncate capitalize text-stone-700">{row.label}</span>
          </span>
          <span className="font-medium tabular-nums text-stone-950">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({
  title,
  subtitle,
  icon: Icon,
  tone,
  rows,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
  rows: LeaderRow[];
}) {
  const c = toneClasses(tone);
  return (
    <section className="flex h-[360px] w-full min-w-0 max-w-[calc(100vw-2rem)] flex-col rounded-lg bg-white p-4 ring-1 ring-stone-200 shadow-sm sm:max-w-none">
      <SectionHeader
        eyebrow="Park ranking"
        title={title}
        body={subtitle}
        action={
          <span className={`grid h-9 w-9 place-items-center rounded-md ring-1 ${c.icon}`}>
            <Icon size={17} />
          </span>
        }
      />
      <ol className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <li className="text-sm text-stone-500">No parks in this window.</li>
        ) : (
          rows.map((r, i) => (
            <li key={r.slug} className="rounded-lg border border-stone-200 p-2.5 transition-colors hover:bg-stone-50">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 w-5 shrink-0 text-xs tabular-nums text-stone-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/park/${r.slug}`} className="truncate text-sm font-semibold text-stone-900 hover:text-forest-700">
                      {r.name}
                    </Link>
                    <span className={`text-sm font-semibold tabular-nums ${c.text}`}>{r.availability_pct}%</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                    <span>{r.region || "Unknown region"}</span>
                    <span>/</span>
                    <span>{fmt(r.available)} of {fmt(r.total_sites)} sites</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.min(100, Math.max(0, r.availability_pct))}%` }} />
                  </div>
                </div>
              </div>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

export function AnalyticsView({ snapshot }: { snapshot: AnalyticsSnapshot }) {
  const { totals, siteTypes, electric, parkNightSeries } = snapshot;
  const [period, setPeriod] = useState<PeriodKey>("tonight");

  const agg = useMemo(() => buildPeriodAggregates(parkNightSeries, period), [parkNightSeries, period]);
  const pressureSeries = useMemo(() => buildLookaheadSeries(parkNightSeries), [parkNightSeries]);
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "Selected window";
  const searchUrl = useMemo(() => searchUrlForSeries(agg.series), [agg.series]);

  const inMarketSiteNights = agg.nightSums.available + agg.nightSums.reserved;
  const pressure = pct(agg.nightSums.reserved, inMarketSiteNights);
  const pressureToneName = pressureTone(pressure);
  const pressureCopy = pressureLabel(pressure);
  const availablePct = pct(agg.medianAvailable, totals.sites);
  const reservedPct = pct(agg.medianReserved, totals.sites);
  const bestRegion = agg.regions[0];
  const bestPark = agg.mostAvailable[0];
  const hardestPark = agg.mostBooked[0];

  const siteTypePieData = useMemo(() => {
    const top = siteTypes.slice(0, 10);
    const rest = siteTypes.slice(10);
    const data = top.map((s) => ({ name: s.label, value: s.count }));
    const otherSum = rest.reduce((sum, s) => sum + s.count, 0);
    if (otherSum > 0) data.push({ name: "Other", value: otherSum });
    return data;
  }, [siteTypes]);

  const electricPieData = useMemo(
    () => [
      { name: "With electric", value: electric.electric, color: "#f59e0b" },
      { name: "No electric", value: electric.non_electric, color: "#2b5d72" },
    ],
    [electric],
  );

  return (
    <div className="w-full min-w-0 bg-stone-50">
      <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-stone-500">
              <Activity size={13} /> Updated {formatRelative(snapshot.generated_at)}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">Analytics</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
              Ontario campsite availability by planning window, with the broader pressure curve kept in view.
            </p>
          </div>
        </section>

        <section className="grid items-end gap-3 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Selected range</div>
                <div className="mt-0.5 text-sm font-medium text-stone-900">
                  {periodLabel} / {agg.rangeLabel}
                </div>
              </div>
              <div className="rounded-md bg-white px-2.5 py-1.5 text-xs text-stone-600 ring-1 ring-stone-200">
                {agg.daysInWindow} {agg.daysInWindow === 1 ? "day" : "days"}
              </div>
            </div>
            <PeriodTabs value={period} onChange={setPeriod} />
          </div>
        </section>

        <PressureOverviewChart series={pressureSeries} />

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={Database}
            label="Sites indexed"
            value={fmt(totals.sites)}
            sub={`${fmt(totals.parks)} parks across ${fmt(totals.operators)} operator networks`}
          />
          <MetricCard
            icon={TrendingUp}
            label={agg.daysInWindow <= 1 ? "Sites available" : "Typical available"}
            value={fmt(agg.medianAvailable)}
            sub={`${availablePct}% of indexed sites for ${periodLabel.toLowerCase()}`}
            tone="emerald"
          />
          <MetricCard
            icon={Flame}
            label="Booking pressure"
            value={`${pressure}%`}
            sub={`${pressureCopy} / ${reservedPct}% of indexed sites typically reserved`}
            tone={pressureToneName}
          />
          <MetricCard
            icon={Tent}
            label="Open site-nights"
            value={fmt(agg.nightSums.available)}
            sub={`${fmt(agg.nightSums.total)} sampled site-nights in this window`}
            tone="lake"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <InsightCard
            icon={Compass}
            label="Best odds"
            title={bestRegion ? `${bestRegion.name} is leading` : "No region data yet"}
            body={
              bestRegion
                ? `${fmt(bestRegion.Available)} typical sites are open there, about ${bestRegion.pct}% of indexed regional capacity.`
                : "Availability has not been sampled for this window yet."
            }
            href={searchUrl}
            cta="Search openings"
            tone="emerald"
          />
          <InsightCard
            icon={MapPinned}
            label="Park to try"
            title={bestPark ? bestPark.name : "No park ranking yet"}
            body={
              bestPark
                ? `${bestPark.availability_pct}% typical availability, with ${fmt(bestPark.available)} of ${fmt(bestPark.total_sites)} sites open.`
                : "Park rankings appear once this window has sampled availability."
            }
            href={bestPark ? `/park/${bestPark.slug}` : undefined}
            cta="Open park"
            tone="lake"
          />
          <InsightCard
            icon={TrendingDown}
            label="Move fast"
            title={hardestPark ? `${hardestPark.name} is tight` : "No scarcity signal yet"}
            body={
              hardestPark
                ? `${hardestPark.availability_pct}% typical availability. ${fmt(agg.distribution.soldOutParks)} parks show zero typical openings in this window.`
                : "Scarcity ranking appears once this window has sampled availability."
            }
            href={hardestPark ? `/park/${hardestPark.slug}` : undefined}
            cta="Inspect pressure"
            tone={pressureToneName}
          />
        </section>

        <section className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Leaderboard
            title={`Most available / ${periodLabel.toLowerCase()}`}
            subtitle="Parks with the largest share of bookable sites."
            icon={TrendingUp}
            tone="emerald"
            rows={agg.mostAvailable}
          />
          <Leaderboard
            title={`Least available / ${periodLabel.toLowerCase()}`}
            subtitle="Parks where the selected window is already tight."
            icon={TrendingDown}
            tone="red"
            rows={agg.mostBooked}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <NetworkChart agg={agg} periodLabel={periodLabel} />
          <RegionBoard regions={agg.regions} />
        </section>

        <InventoryCharts siteTypePieData={siteTypePieData} electricPieData={electricPieData} />

        <p className="text-xs leading-relaxed text-stone-500">
          Sources: Ontario Parks, Parks Canada, and GoingToCamp-backed Conservation Authorities, polled live for this
          snapshot. <Link href="/data" className="font-medium text-forest-700 hover:underline">See data freshness</Link>{" "}
          for per-operator update times and CSV downloads.
        </p>
      </div>
    </div>
  );
}
