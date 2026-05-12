"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Clock, Database } from "lucide-react";

type OperatorHealth = {
  operator: { id: string; name: string; vendor: string };
  sites_indexed: number;
  median_freshness_minutes: number;
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

export function DataTabs({ ops, datasets }: Props) {
  const [operatorPage, setOperatorPage] = useState(1);

  const operatorPages = totalPages(ops.length, OPERATOR_PAGE_SIZE);
  const currentOperatorPage = clampPage(operatorPage, operatorPages);
  const paginatedOps = paginate(ops, currentOperatorPage, OPERATOR_PAGE_SIZE);

  return (
    <div className="mt-10 space-y-12">
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
          <h2 className="text-xl font-semibold tracking-tight">Per-operator status</h2>
          <div className="mt-3 card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left p-3 font-medium">Operator</th>
                    <th className="text-left p-3 font-medium">Vendor</th>
                    <th className="text-right p-3 font-medium">Sites</th>
                    <th className="text-right p-3 font-medium">Freshness (p50)</th>
                    <th className="text-left p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOps.map((o) => (
                    <tr key={o.operator.id} className="border-t border-stone-100">
                      <td className="p-3 font-medium">{o.operator.name}</td>
                      <td className="p-3 text-stone-600">
                        <span className="font-mono text-xs">{o.operator.vendor}</span>
                      </td>
                      <td className="p-3 text-right tabular-nums">{o.sites_indexed.toLocaleString()}</td>
                      <td className="p-3 text-right tabular-nums whitespace-nowrap">{o.median_freshness_minutes}m</td>
                      <td className="p-3">
                        <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationControls
              label="operators"
              page={currentOperatorPage}
              pageSize={OPERATOR_PAGE_SIZE}
              total={ops.length}
              onPageChange={setOperatorPage}
            />
          </div>
        </div>

        <div className="prose prose-stone max-w-none">
          <h2>How we refresh</h2>
          <ul>
            <li><strong>Metadata</strong> — park layouts, amenities, equipment compatibility. Refreshed weekly on Sundays at 03:00 ET.</li>
            <li><strong>Availability</strong> — per-site, per-night status. Background batches run every 5 minutes; individual sites refresh on demand when someone opens live availability.</li>
            <li><strong>Reservation-opening days (Feb–Apr at 7am ET)</strong> — ingest is suspended so we don&apos;t add load during the operators&apos; peak window.</li>
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
            This data is sourced from publicly accessible operator APIs (Ontario Parks / Camis, Parks Canada, Conservation Authorities via GoingToCamp).
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
