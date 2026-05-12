"use client";

import { useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Download, Clock, Database } from "lucide-react";

type OperatorHealth = {
  operator: { id: string; name: string; vendor: string };
  sitesIndexed: number;
  availableToday: number;
  checkedLastTwoHours: number;
  checkedLastSixHours: number;
  currentP50Minutes: number | null;
  currentP90Minutes: number | null;
  availableP50Minutes: number | null;
  hotP50Minutes: number | null;
  hotDueSites: number;
  latestCheckedMinutesAgo: number | null;
  status: "active" | "warming" | "queued" | "steady";
};

type ScopeSummary = {
  scope: string;
  runs: number;
  sitesUpdated: number;
  nightsUpdated: number;
  latestStartedAt: string | null;
  averageDurationMs: number | null;
};

type Dataset = {
  id: string;
  label: string;
  description: string;
  filename: string;
  rowCount: number;
  dataUrl: string;
};

type Props = {
  ops: OperatorHealth[];
  datasets: Dataset[];
  scopes: ScopeSummary[];
};

const OPERATOR_PAGE_SIZE = 8;

function totalPages(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

function clampPage(page: number, pages: number) {
  return Math.min(Math.max(page, 1), pages);
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "-";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function statusMeta(status: OperatorHealth["status"]) {
  if (status === "active") {
    return {
      label: "active",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      dot: "bg-emerald-500",
    };
  }
  if (status === "warming") {
    return {
      label: "warming",
      className: "bg-sky-50 text-sky-700 ring-sky-200",
      dot: "bg-sky-500",
    };
  }
  if (status === "queued") {
    return {
      label: "queued",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
      dot: "bg-amber-500",
    };
  }
  return {
    label: "steady",
    className: "bg-stone-50 text-stone-700 ring-stone-200",
    dot: "bg-stone-400",
  };
}

type PaginationControlsProps = {
  label: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

function PaginationControls({ label, page, pageSize, total, onPageChange }: PaginationControlsProps) {
  const pages = totalPages(total, pageSize);
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="border-t border-stone-100 px-3 py-2.5 flex flex-col gap-2 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
      <div className="tabular-nums">
        Showing {first}-{last} of {total} {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-stone-600">
          Page {page} of {pages}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-stone-200 text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronLeft size={15} />
            <span className="sr-only">Previous {label} page</span>
          </button>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(pages, page + 1))}
            disabled={page >= pages}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-stone-200 text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ChevronRight size={15} />
            <span className="sr-only">Next {label} page</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function DataTabs({ ops, datasets, scopes }: Props) {
  const [operatorPage, setOperatorPage] = useState(1);

  const statusRank: Record<OperatorHealth["status"], number> = { queued: 0, warming: 1, active: 2, steady: 3 };
  const sortedOps = [...ops].sort((a, b) => {
    const rankDelta = statusRank[a.status] - statusRank[b.status];
    if (rankDelta !== 0) return rankDelta;
    return b.hotDueSites - a.hotDueSites || a.operator.name.localeCompare(b.operator.name);
  });
  const operatorPages = totalPages(sortedOps.length, OPERATOR_PAGE_SIZE);
  const currentOperatorPage = clampPage(operatorPage, operatorPages);
  const paginatedOps = paginate(sortedOps, currentOperatorPage, OPERATOR_PAGE_SIZE);

  return (
    <div className="mt-10 w-full min-w-0 space-y-12">
      <nav className="border-b border-stone-200 flex items-end gap-1 overflow-x-auto scrollbar-none">
        <a
          href="#refresh-status"
          className="relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap text-forest-700"
        >
          <Clock size={14} />
          Refresh status
          <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-forest-600" />
        </a>
        <a
          href="#downloads"
          className="relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap text-stone-600 hover:text-stone-900 transition-colors"
        >
          <Download size={14} />
          Downloads
        </a>
      </nav>

      <section id="refresh-status" className="space-y-10 scroll-mt-24">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Worker cadence</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {scopes.map((scope) => (
              <div key={scope.scope} className="min-w-0 rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 truncate font-semibold text-stone-900" title={scope.scope}>
                    {scope.scope}
                  </div>
                  <Activity size={15} className="text-forest-700" />
                </div>
                <div className="mt-3 text-2xl font-semibold tabular-nums">{scope.sitesUpdated.toLocaleString()}</div>
                <div className="mt-1 text-xs text-stone-500">
                  {scope.runs} runs · {scope.nightsUpdated.toLocaleString()} nights · avg {formatDuration(scope.averageDurationMs)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold tracking-tight">Per-operator status</h2>
          <div className="card mt-3 w-full min-w-0 overflow-hidden">
            <div className="divide-y divide-stone-100 sm:hidden">
              {paginatedOps.map((o) => {
                const status = statusMeta(o.status);
                const checkedPct = percentage(o.checkedLastTwoHours, o.sitesIndexed);
                return (
                  <div key={o.operator.id} className="bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-stone-900">{o.operator.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-stone-500">{o.operator.vendor}</div>
                      </div>
                      <span className={`chip shrink-0 ring-1 ${status.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} /> {status.label}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-stone-500">Sites</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-stone-900">{o.sitesIndexed.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-stone-500">Open today</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-emerald-700">{o.availableToday.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-stone-500">Available p50</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-stone-900">{formatMinutes(o.availableP50Minutes)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-stone-500">Current p50</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-stone-900">{formatMinutes(o.currentP50Minutes)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-stone-500">Checked &lt;2h</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-stone-900">
                          {o.checkedLastTwoHours.toLocaleString()}
                          <span className="ml-1 text-xs font-normal text-stone-500">{checkedPct}%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-stone-500">Hot due</div>
                        <div className="mt-0.5 font-semibold tabular-nums text-stone-900">{o.hotDueSites.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden max-w-full overflow-x-auto sm:block">
              <table className="min-w-[1040px] w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left p-3 font-medium">Operator</th>
                    <th className="text-left p-3 font-medium">Vendor</th>
                    <th className="text-right p-3 font-medium">Sites</th>
                    <th className="text-right p-3 font-medium">Open today</th>
                    <th className="text-right p-3 font-medium">Available p50</th>
                    <th className="text-right p-3 font-medium">Current p50</th>
                    <th className="text-right p-3 font-medium">Checked &lt;2h</th>
                    <th className="text-right p-3 font-medium">Hot due</th>
                    <th className="text-left p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOps.map((o) => {
                    const status = statusMeta(o.status);
                    const checkedPct = percentage(o.checkedLastTwoHours, o.sitesIndexed);
                    return (
                      <tr key={o.operator.id} className="border-t border-stone-100">
                        <td className="p-3 font-medium">{o.operator.name}</td>
                        <td className="p-3 text-stone-600">
                          <span className="font-mono text-xs">{o.operator.vendor}</span>
                        </td>
                        <td className="p-3 text-right tabular-nums">{o.sitesIndexed.toLocaleString()}</td>
                        <td className="p-3 text-right tabular-nums">{o.availableToday.toLocaleString()}</td>
                        <td className="p-3 text-right tabular-nums whitespace-nowrap">{formatMinutes(o.availableP50Minutes)}</td>
                        <td className="p-3 text-right tabular-nums whitespace-nowrap">
                          {formatMinutes(o.currentP50Minutes)}
                          <span className="ml-1 text-stone-400">p90 {formatMinutes(o.currentP90Minutes)}</span>
                        </td>
                        <td className="p-3 text-right tabular-nums whitespace-nowrap">
                          {o.checkedLastTwoHours.toLocaleString()}
                          <span className="ml-1 text-stone-400">{checkedPct}%</span>
                        </td>
                        <td className="p-3 text-right tabular-nums">{o.hotDueSites.toLocaleString()}</td>
                        <td className="p-3">
                          <span className={`chip ring-1 ${status.className}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} /> {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationControls
              label="operators"
              page={currentOperatorPage}
              pageSize={OPERATOR_PAGE_SIZE}
              total={sortedOps.length}
              onPageChange={setOperatorPage}
            />
          </div>
        </div>

        <div className="prose prose-stone max-w-none">
          <h2>How we refresh</h2>
          <ul>
            <li><strong>Metadata</strong> - park layouts, amenities, equipment compatibility. Refreshed only when operator structure changes.</li>
            <li><strong>Availability</strong> - per-site, per-night status. Background batches run every 5 minutes with priority for today, tomorrow, and bookable inventory; individual sites refresh on demand when someone opens live availability.</li>
            <li><strong>Freshness metrics</strong> - available-site freshness is the primary user-facing number. All-site p50 includes reserved and closed sites that intentionally refresh more slowly.</li>
            <li><strong>Reservation-opening days (Feb-Apr at 7am ET)</strong> - ingest is suspended so we don&apos;t add load during the operators&apos; peak window.</li>
          </ul>
          <h2>What we don&apos;t do</h2>
          <ul>
            <li>We do not handle bookings, payments, or accounts. All transactions happen on the operator&apos;s own site.</li>
            <li>We do not bypass any operator rate limits. We honor 429s aggressively and fall back exponentially.</li>
            <li>We identify ourselves on every request with a clear User-Agent including contact info.</li>
          </ul>
        </div>
      </section>

      <section id="downloads" className="space-y-4 scroll-mt-24">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Downloads</h2>
          <p className="mt-2 text-sm text-stone-600 max-w-2xl">
            Public datasets in CSV format, generated from our latest ingest. Free to use — no API key needed.
            These are snapshot exports of the same data powering this site.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {datasets.map((ds) => (
            <div key={ds.id} className="card p-5 flex flex-col">
              <Database size={18} className="text-forest-700" />
              <div className="mt-3 font-semibold text-stone-900">{ds.label}</div>
              <p className="mt-1 text-xs text-stone-600 leading-relaxed flex-1">{ds.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-stone-500 tabular-nums">
                  {ds.rowCount.toLocaleString()} rows
                </span>
                <a href={ds.dataUrl} download={ds.filename} className="btn-primary text-xs py-1.5 px-3">
                  <Download size={12} /> {ds.filename}
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="card p-5 mt-4 text-sm text-stone-600 leading-relaxed">
          <div className="font-semibold text-stone-900 mb-2">License &amp; attribution</div>
          <p>
            This data is sourced from publicly accessible operator APIs (Ontario Parks / Camis, Parks Canada,
            and Conservation Authorities via GoingToCamp, Campspot, and Let&apos;s Camp).
            We are not affiliated with any operator. Data is provided as-is with no warranty. A link back to{" "}
            <a href="https://ontariocamps.app" className="text-forest-700 hover:underline">ontariocamps.app</a> is appreciated but not required.
          </p>
          <p className="mt-2">
            Need bulk access or a different format? The full dataset lives in our{" "}
            <a href="https://github.com/braedonsaunders/ontariocamps.app" className="text-forest-700 hover:underline" target="_blank" rel="noopener noreferrer">
              open-source repo
            </a>{" "}
            and can be self-hosted via the Supabase schema.
          </p>
        </div>
      </section>
    </div>
  );
}
