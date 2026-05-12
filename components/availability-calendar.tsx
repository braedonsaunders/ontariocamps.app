"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, ExternalLink } from "lucide-react";
import { buildOneNightBookingUrl } from "@/lib/booking-url";

type Status = "available" | "reserved" | "closed" | "unknown";

export type CalendarSite = {
  id: string;
  name: string;
  site_type: string;
  site_type_label: string | null;
  has_electric: boolean;
};

export type CalendarRow = {
  site: CalendarSite;
  /** Map of YYYY-MM-DD → status. Missing dates render as "unknown". */
  nights: Record<string, Status>;
};

type Props = {
  /** All sites in the park that have per-night data. */
  rows: CalendarRow[];
  /** Total number of sites at the park (so we can disclose what's not shown). */
  totalSites: number;
  /** Last-checked-at timestamp shown in the header. */
  lastCheckedAt: string | null;
  /** Per-site vendor_site_id (Camis resourceId) for booking URLs. */
  vendorSiteIds?: Record<string, string>;
  /** Per-site operator booking URLs, including resourceId/mapId when known. */
  bookingUrls?: Record<string, string>;
  /** The park's pre-built vendor URL (already includes resourceLocationId etc). */
  vendorUrl?: string;
  /** Opens a site detail flyout in the parent park page. */
  onOpenSiteDetails?: (siteId: string) => void;
  /** True while live availability is being refreshed; book links are withheld. */
  checkingLive?: boolean;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_BG: Record<Status, string> = {
  available: "bg-emerald-500 hover:bg-emerald-600",
  reserved: "bg-red-400 hover:bg-red-500",
  closed: "bg-red-800 hover:bg-red-900",
  unknown: "bg-stone-200 hover:bg-stone-300",
};
const STATUS_LABEL: Record<Status, string> = {
  available: "Available",
  reserved: "Reserved",
  closed: "Closed",
  unknown: "Unknown",
};

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function AvailabilityCalendar({
  rows,
  totalSites,
  lastCheckedAt,
  vendorSiteIds,
  bookingUrls,
  vendorUrl,
  onOpenSiteDetails,
  checkingLive = false,
}: Props) {
  // Compose the operator booking URL for one (site, night) cell client-side.
  // (Server-rendered components can't pass functions across the boundary.)
  const buildBookingUrl = (siteId: string, night: string): string | null => {
    const siteBookingUrl = bookingUrls?.[siteId];
    if (siteBookingUrl) return buildOneNightBookingUrl(siteBookingUrl, night);
    if (!vendorSiteIds || !vendorUrl) return null;
    const vendorSiteId = vendorSiteIds[siteId];
    if (!vendorSiteId) return null;
    return buildOneNightBookingUrl(vendorUrl, night, { resourceId: vendorSiteId });
  };
  // Determine the dataset's window from the first row.
  const window = useMemo(() => {
    let earliest: string | null = null;
    let latest: string | null = null;
    for (const r of rows) {
      for (const date of Object.keys(r.nights)) {
        if (!earliest || date < earliest) earliest = date;
        if (!latest || date > latest) latest = date;
      }
    }
    return { earliest, latest };
  }, [rows]);

  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [siteTypeFilter, setSiteTypeFilter] = useState<string | null>(null);

  // Start date for the visible window
  const visibleStart = useMemo(() => {
    if (!window.earliest) return new Date();
    return addDays(new Date(window.earliest + "T00:00:00Z"), weekOffset * 14);
  }, [window.earliest, weekOffset]);

  const VISIBLE_DAYS = 14;
  const visibleDates = useMemo(
    () => Array.from({ length: VISIBLE_DAYS }, (_, i) => fmt(addDays(visibleStart, i))),
    [visibleStart],
  );
  const canGoBack = weekOffset > 0;
  const canGoForward = useMemo(() => {
    if (!window.latest) return false;
    return fmt(addDays(visibleStart, VISIBLE_DAYS)) <= window.latest;
  }, [window.latest, visibleStart]);

  const siteTypes = useMemo(() => {
    const types = new Map<string, number>();
    for (const r of rows) {
      types.set(r.site.site_type, (types.get(r.site.site_type) ?? 0) + 1);
    }
    return Array.from(types.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // Filter + sort rows: most available within visible window first
  const filteredRows = useMemo(() => {
    let r = rows;
    if (siteTypeFilter) r = r.filter((row) => row.site.site_type === siteTypeFilter);
    if (showAvailableOnly) {
      r = r.filter((row) => visibleDates.some((d) => row.nights[d] === "available"));
    }
    // Sort by availability count in visible window (desc)
    const scored = r.map((row) => ({
      row,
      score: visibleDates.reduce((sum, d) => sum + (row.nights[d] === "available" ? 1 : 0), 0),
    }));
    scored.sort((a, b) => b.score - a.score || a.row.site.name.localeCompare(b.row.site.name));
    return scored.map((s) => s.row);
  }, [rows, showAvailableOnly, siteTypeFilter, visibleDates]);

  // Aggregate stats for the visible window
  const windowStats = useMemo(() => {
    let total = 0;
    let avail = 0;
    for (const r of filteredRows) {
      for (const d of visibleDates) {
        total += 1;
        if (r.nights[d] === "available") avail += 1;
      }
    }
    return {
      total,
      avail,
      pct: total > 0 ? Math.round((avail / total) * 100) : 0,
    };
  }, [filteredRows, visibleDates]);

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center text-stone-500 text-sm">
        Per-night data not yet collected for this park&apos;s sites. Run <code className="bg-stone-100 px-1 rounded">npm run ingest</code> to populate.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Controls bar */}
      <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2 flex-wrap">
        {checkingLive && (
          <div className="w-full rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
            Checking live status. Green cells are last-seen open until this finishes, so booking links are temporarily disabled.
          </div>
        )}
        <div className="flex items-center gap-1 rounded-md ring-1 ring-stone-200 p-0.5">
          <button
            onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
            disabled={!canGoBack}
            className="h-7 w-7 grid place-items-center rounded text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous fortnight"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="px-2 text-xs font-medium text-stone-700 whitespace-nowrap min-w-[140px] text-center">
            {fmtRange(visibleDates[0], visibleDates[VISIBLE_DAYS - 1])}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            disabled={!canGoForward}
            className="h-7 w-7 grid place-items-center rounded text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next fortnight"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        <label className="chip cursor-pointer ring-1 ring-stone-300 select-none hover:bg-stone-50">
          <input
            type="checkbox"
            className="accent-forest-700"
            checked={showAvailableOnly}
            onChange={(e) => setShowAvailableOnly(e.target.checked)}
          />
          <span className="ml-1">Has open nights only</span>
        </label>

        {siteTypes.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-stone-500 flex items-center gap-1"><Filter size={11} /> Type:</span>
            <button
              onClick={() => setSiteTypeFilter(null)}
              className={`chip ring-1 ${
                siteTypeFilter === null
                  ? "bg-forest-700 text-white ring-forest-700"
                  : "ring-stone-300 text-stone-700 hover:bg-stone-50"
              }`}
            >
              All ({rows.length})
            </button>
            {siteTypes.map(([t, count]) => (
              <button
                key={t}
                onClick={() => setSiteTypeFilter(t)}
                className={`chip ring-1 ${
                  siteTypeFilter === t
                    ? "bg-forest-700 text-white ring-forest-700"
                    : "ring-stone-300 text-stone-700 hover:bg-stone-50"
                }`}
              >
                {t.toUpperCase()} ({count})
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto text-xs text-stone-600 inline-flex items-center gap-2">
          <span className="font-semibold text-stone-900 tabular-nums">{windowStats.avail.toLocaleString()}</span>
          / {windowStats.total.toLocaleString()} cells available
          <span className="font-semibold text-emerald-700 tabular-nums">{windowStats.pct}%</span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <table className="text-xs min-w-full border-collapse">
          <thead className="bg-stone-50 text-stone-500 sticky top-0 z-10">
            <tr>
              <th className="text-left font-medium py-2 px-3 sticky left-0 bg-stone-50 border-r border-stone-200 z-20 min-w-[160px]">
                Site
              </th>
              {visibleDates.map((d) => {
                const dt = new Date(d + "T00:00:00Z");
                const dow = dt.getUTCDay();
                const isWeekend = dow === 5 || dow === 6;
                return (
                  <th
                    key={d}
                    className={`p-1 font-normal text-center min-w-[36px] ${isWeekend ? "bg-stone-100" : ""}`}
                  >
                    <div className="text-[10px] leading-tight">{DAY_LABELS[dow]}</div>
                    <div className="font-semibold text-stone-700 leading-tight tabular-nums">{dt.getUTCDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const availInWindow = visibleDates.filter((d) => row.nights[d] === "available").length;
              return (
                <tr key={row.site.id} className="border-t border-stone-100 hover:bg-stone-50/60">
                  <td className="py-1.5 px-3 sticky left-0 bg-white border-r border-stone-200 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {onOpenSiteDetails ? (
                        <button
                          type="button"
                          onClick={() => onOpenSiteDetails(row.site.id)}
                          className="text-stone-900 font-medium tabular-nums hover:text-forest-700 transition-colors"
                        >
                          {row.site.name}
                        </button>
                      ) : (
                        <span className="text-stone-900 font-medium tabular-nums">{row.site.name}</span>
                      )}
                      <span className="text-[10px] uppercase text-stone-400">{row.site.site_type}</span>
                      {row.site.has_electric && (
                        <span className="text-[10px] text-amber-600 font-medium">⚡</span>
                      )}
                      <span
                        className={`ml-auto text-[10px] tabular-nums ${
                          availInWindow > 0 ? "text-emerald-700 font-semibold" : "text-stone-400"
                        }`}
                      >
                        {availInWindow}/{VISIBLE_DAYS}
                      </span>
                    </div>
                  </td>
                  {visibleDates.map((d) => {
                    const status = row.nights[d] ?? "unknown";
                    const url = status === "available" && !checkingLive && buildBookingUrl ? buildBookingUrl(row.site.id, d) : null;
                    const cellBg = STATUS_BG[status];
                    const cell = (
                      <span
                        className={`block h-6 mx-px rounded-sm ${cellBg} transition-colors`}
                        title={`Site ${row.site.name} · ${d} · ${STATUS_LABEL[status]}`}
                      />
                    );
                    return (
                      <td key={d} className="p-0.5 align-middle">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block cursor-pointer"
                            aria-label={`Book site ${row.site.name} on ${d}`}
                          >
                            {cell}
                          </a>
                        ) : (
                          cell
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend + disclosure footer */}
      <div className="px-4 py-2.5 border-t border-stone-100 flex items-center flex-wrap gap-3 text-xs text-stone-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-500" /> {checkingLive ? "Last seen open" : "Available"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-400" /> Reserved
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-800" /> Closed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-stone-200" /> Unknown
        </span>
        <span className="ml-auto text-stone-500">
          {checkingLive ? "Live check in progress" : "Click any green cell to book that night"}
          {rows.length < totalSites && (
            <> · showing {rows.length} of {totalSites} sites <ExternalLink size={10} className="inline" /></>
          )}
          {lastCheckedAt && (
            <> · checked {formatTime(lastCheckedAt)}</>
          )}
        </span>
      </div>
    </div>
  );
}

function fmtRange(start: string, end: string): string {
  const a = new Date(start + "T00:00:00Z");
  const b = new Date(end + "T00:00:00Z");
  const optsA: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const optsB: Intl.DateTimeFormatOptions =
    a.getUTCFullYear() !== b.getUTCFullYear() || a.getUTCMonth() !== b.getUTCMonth()
      ? { month: "short", day: "numeric", timeZone: "UTC" }
      : { day: "numeric", timeZone: "UTC" };
  return `${a.toLocaleDateString("en-CA", optsA)} – ${b.toLocaleDateString("en-CA", optsB)}`;
}

function formatTime(iso: string): string {
  const t = new Date(iso).getTime();
  const ms = Date.now() - t;
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
