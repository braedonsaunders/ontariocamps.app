import type { Metadata } from "next";
import { operatorHealth } from "@/lib/search";
import { getDataSourceInfo } from "@/lib/data-source";
import { sql } from "@/lib/db/client";
import { Activity, Clock, Database } from "lucide-react";

export const metadata: Metadata = {
  title: "Data freshness",
  description: "How fresh our index is, per operator.",
};
export const dynamic = "force-dynamic";

export default async function DataPage() {
  const [ops, totals, info] = await Promise.all([
    operatorHealth(),
    sql()<Array<{ parks: number; sites: number }>>`SELECT parks, sites FROM analytics_totals`,
    getDataSourceInfo(),
  ]);
  const dataSource = info.hasReal ? "real" : "mock";
  const dataSourceGeneratedAt = info.availabilityLastRefreshedAt ?? info.metadataLastRefreshedAt;
  const ingestRuns = info.refreshRuns;
  const totalSites = totals[0]?.sites ?? 0;
  const totalParks = totals[0]?.parks ?? 0;
  const overallMedian = Math.round(
    ops.reduce((sum, o) => sum + o.median_freshness_minutes, 0) / Math.max(ops.length, 1),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">How fresh is our data?</h1>
      <p className="text-stone-600 mt-2 max-w-2xl">
        We re-check every operator on a schedule. Per the technical spec, availability refreshes every
        15 minutes during day hours, every hour overnight, with metadata refreshed weekly.
      </p>

      <div
        className={`mt-6 card p-4 flex items-center gap-3 ${
          dataSource === "real" ? "ring-emerald-200 bg-emerald-50" : "ring-amber-200 bg-amber-50"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            dataSource === "real" ? "bg-emerald-500" : "bg-amber-500"
          }`}
        />
        <div className="text-sm">
          <span className="font-semibold">Data source: {dataSource === "real" ? "live operator APIs" : "seeded mock"}</span>
          {dataSourceGeneratedAt && (
            <span className="text-stone-600 ml-2">snapshot {new Date(dataSourceGeneratedAt).toLocaleString()}</span>
          )}
          {dataSource === "mock" && (
            <span className="text-stone-600 ml-2">— run <code className="font-mono text-xs bg-white px-1 rounded">npm run ingest</code> to switch to live</span>
          )}
        </div>
      </div>

      <div className="mt-8 grid sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <Database size={18} className="text-forest-700" />
          <div className="text-xs text-stone-500 mt-3 uppercase tracking-wide">Sites indexed</div>
          <div className="text-3xl font-semibold mt-1">{totalSites.toLocaleString()}</div>
          <div className="text-xs text-stone-500 mt-1">Across {totalParks} parks in {ops.length} operators</div>
        </div>
        <div className="card p-5">
          <Clock size={18} className="text-forest-700" />
          <div className="text-xs text-stone-500 mt-3 uppercase tracking-wide">Median freshness</div>
          <div className="text-3xl font-semibold mt-1">{overallMedian}m</div>
          <div className="text-xs text-stone-500 mt-1">Aggregated across all operators</div>
        </div>
        <div className="card p-5">
          <Activity size={18} className="text-forest-700" />
          <div className="text-xs text-stone-500 mt-3 uppercase tracking-wide">Booking window</div>
          <div className="text-3xl font-semibold mt-1">5 months</div>
          <div className="text-xs text-stone-500 mt-1">May 15 → Oct 15, partitioned by month</div>
        </div>
      </div>

      <h2 className="mt-12 text-xl font-semibold tracking-tight">Per-operator status</h2>
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

      {ingestRuns.length > 0 && (
        <>
          <h2 className="mt-12 text-xl font-semibold tracking-tight">Last refresh per type</h2>
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
        </>
      )}

      <div className="mt-10 prose prose-stone max-w-none">
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
    </div>
  );
}
