"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Activity, Download, Clock, Database } from "lucide-react";
import { timeAgo } from "@/lib/utils";

type OperatorHealth = {
  operator: { id: string; name: string; vendor: string };
  sites_indexed: number;
  median_freshness_minutes: number;
};

type IngestRun = {
  id: number;
  refresh_type: string;
  scope: string | null;
  status: string;
  parks_seen: number;
  sites_seen: number;
  sites_updated: number;
  nights_updated: number;
  duration_ms: number | null;
  errors: string[];
  finished_at: string | null;
};

type Dataset = {
  id: string;
  label: string;
  description: string;
  filename: string;
  rowCount: number;
  data: Record<string, unknown>[];
};

type Tab = "status" | "downloads";

type Props = {
  ops: OperatorHealth[];
  ingestRuns: IngestRun[];
  datasets: Dataset[];
};

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = keys.join(",");
  const body = rows.map((r) => keys.map((k) => escape(r[k])).join(",")).join("\n");
  return header + "\n" + body;
}

function downloadCSV(filename: string, data: Record<string, unknown>[]) {
  const csv = toCSV(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataTabs({ ops, ingestRuns, datasets }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("status");

  const TABS: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: "status", label: "Refresh status", icon: Clock },
    { id: "downloads", label: "Downloads", icon: Download },
  ];

  return (
    <div className="mt-10">
      <div className="border-b border-stone-200 flex items-end gap-1 overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "text-forest-700" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <t.icon size={14} />
              {t.label}
              {active && (
                <motion.span
                  layoutId="data-tab-underline"
                  className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-forest-600"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <AnimatePresence mode="wait">
          {activeTab === "status" && (
            <motion.div
              key="status"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="space-y-10"
            >
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Per-operator status</h2>
                <div className="mt-3 card overflow-hidden">
                  <table className="min-w-full text-sm">
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
                      {ops.map((o) => (
                        <tr key={o.operator.id} className="border-t border-stone-100">
                          <td className="p-3 font-medium">{o.operator.name}</td>
                          <td className="p-3 text-stone-600">
                            <span className="font-mono text-xs">{o.operator.vendor}</span>
                          </td>
                          <td className="p-3 text-right tabular-nums">{o.sites_indexed.toLocaleString()}</td>
                          <td className="p-3 text-right tabular-nums">{o.median_freshness_minutes}m</td>
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
              </div>

              {ingestRuns.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Last refresh per type</h2>
                  <div className="mt-3 card overflow-hidden">
                    <table className="min-w-full text-sm">
                      <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wide">
                        <tr>
                          <th className="text-left p-3 font-medium">Type</th>
                          <th className="text-left p-3 font-medium">Scope</th>
                          <th className="text-left p-3 font-medium">Status</th>
                          <th className="text-right p-3 font-medium">Parks</th>
                          <th className="text-right p-3 font-medium">Sites</th>
                          <th className="text-right p-3 font-medium">Nights</th>
                          <th className="text-right p-3 font-medium">Duration</th>
                          <th className="text-right p-3 font-medium">Errors</th>
                          <th className="text-left p-3 font-medium">Finished</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ingestRuns.map((r) => (
                          <tr key={r.id} className="border-t border-stone-100">
                            <td className="p-3 font-medium font-mono text-xs">{r.refresh_type}</td>
                            <td className="p-3 text-stone-600 text-xs">{r.scope ?? "all"}</td>
                            <td className="p-3">
                              <span
                                className={`chip ring-1 ${
                                  r.status === "success"
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                    : r.status === "partial"
                                    ? "bg-amber-50 text-amber-700 ring-amber-200"
                                    : "bg-red-50 text-red-700 ring-red-200"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="p-3 text-right tabular-nums">{r.parks_seen}</td>
                            <td className="p-3 text-right tabular-nums">{r.sites_updated.toLocaleString()}</td>
                            <td className="p-3 text-right tabular-nums">{r.nights_updated.toLocaleString()}</td>
                            <td className="p-3 text-right tabular-nums text-stone-600">
                              {r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}
                            </td>
                            <td className="p-3 text-right tabular-nums">{r.errors.length}</td>
                            <td className="p-3 text-stone-600 text-xs">
                              {r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="prose prose-stone max-w-none">
                <h2>How we refresh</h2>
                <ul>
                  <li><strong>Metadata</strong> — park layouts, amenities, equipment compatibility. Refreshed weekly on Sundays at 03:00 ET.</li>
                  <li><strong>Availability</strong> — per-site, per-night status. Every 15 min during 7am–11pm ET, hourly overnight.</li>
                  <li><strong>Reservation-opening days (Feb–Apr at 7am ET)</strong> — ingest is suspended so we don&apos;t add load during the operators&apos; peak window.</li>
                </ul>
                <h2>What we don&apos;t do</h2>
                <ul>
                  <li>We do not handle bookings, payments, or accounts. All transactions happen on the operator&apos;s own site.</li>
                  <li>We do not bypass any operator rate limits. We honor 429s aggressively and fall back exponentially.</li>
                  <li>We identify ourselves on every request with a clear User-Agent including contact info.</li>
                </ul>
              </div>
            </motion.div>
          )}

          {activeTab === "downloads" && (
            <motion.div
              key="downloads"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <p className="text-sm text-stone-600 max-w-2xl">
                Public datasets in CSV format, generated from our latest ingest. Free to use — no API key needed.
                These are snapshot exports of the same data powering this site.
              </p>

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
                      <button
                        type="button"
                        onClick={() => downloadCSV(ds.filename, ds.data)}
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        <Download size={12} /> {ds.filename}
                      </button>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
