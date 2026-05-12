import type { Metadata } from "next";
import { getAvailabilityHealth, getDataSourceInfo } from "@/lib/data-source";
import { sql } from "@/lib/db/client";
import { Clock, Database, Radio, Zap } from "lucide-react";
import { DataTabs } from "@/components/data-tabs";

export const metadata: Metadata = {
  title: "Data",
  description: "Data freshness status and downloadable datasets from ontariocamps.app.",
};
export const dynamic = "force-dynamic";

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

export default async function DataPage() {
  const [health, totals, info] = await Promise.all([
    getAvailabilityHealth(),
    sql()<Array<{ parks: number; sites: number }>>`
      SELECT
        (SELECT count(*) FROM parks)::int AS parks,
        (SELECT count(*) FROM sites)::int AS sites
    `,
    getDataSourceInfo(),
  ]);
  const dataSource = info.hasReal ? "real" : "mock";
  const dataSourceGeneratedAt = info.availabilityLastRefreshedAt ?? info.metadataLastRefreshedAt;
  const totalSites = totals[0]?.sites ?? 0;
  const totalParks = totals[0]?.parks ?? 0;
  const ops = health.operators;
  const workerHealthy = health.worker.latestStatus === "success" && (health.worker.latestStartedMinutesAgo ?? Infinity) <= 15;
  const hotCoverage = percentage(health.freshness.checkedLastTwoHours, health.freshness.totalSites);

  const datasets = [
    {
      id: "parks",
      label: "Parks",
      description: `${totalParks.toLocaleString()} parks across ${ops.length.toLocaleString()} operators - names, regions, coordinates, operator, and vendor IDs.`,
      filename: "ontariocamps-parks.csv",
      rowCount: totalParks,
      dataUrl: "/api/data/parks",
    },
    {
      id: "operators",
      label: "Operators",
      description: `${ops.length.toLocaleString()} campground operators - vendor platform, base URL, and booking URL.`,
      filename: "ontariocamps-operators.csv",
      rowCount: ops.length,
      dataUrl: "/api/data/operators",
    },
    {
      id: "sites",
      label: "Sites",
      description: `${totalSites.toLocaleString()} individual campsites - type, amenities, rule highlights, restrictions, nearby features, and fit details.`,
      filename: "ontariocamps-sites.csv",
      rowCount: totalSites,
      dataUrl: "/api/data/sites",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Data</h1>
      <p className="text-stone-600 mt-2 max-w-3xl">
        Live ingest health, useful availability freshness, and one-click CSV downloads of public datasets.
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
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`card p-5 ${workerHealthy ? "ring-emerald-200 bg-emerald-50/60" : "ring-amber-200 bg-amber-50/60"}`}>
          <Radio size={18} className={workerHealthy ? "text-emerald-700" : "text-amber-700"} />
          <div className="text-xs text-stone-500 mt-3 uppercase tracking-wide">Worker heartbeat</div>
          <div className="text-3xl font-semibold mt-1">{formatMinutes(health.worker.latestStartedMinutesAgo)}</div>
          <div className="text-xs text-stone-500 mt-1">
            {health.worker.latestScope ?? "none"} · {health.worker.latestSitesUpdated.toLocaleString()} sites · {formatDuration(health.worker.latestDurationMs)}
          </div>
        </div>
        <div className="card p-5">
          <Database size={18} className="text-forest-700" />
          <div className="text-xs text-stone-500 mt-3 uppercase tracking-wide">Sites indexed</div>
          <div className="text-3xl font-semibold mt-1">{totalSites.toLocaleString()}</div>
          <div className="text-xs text-stone-500 mt-1">Across {totalParks} parks in {ops.length} operators</div>
        </div>
        <div className="card p-5">
          <Zap size={18} className="text-forest-700" />
          <div className="text-xs text-stone-500 mt-3 uppercase tracking-wide">Available freshness</div>
          <div className="text-3xl font-semibold mt-1">{formatMinutes(health.freshness.availableP50Minutes)}</div>
          <div className="text-xs text-stone-500 mt-1">
            {health.freshness.availableToday.toLocaleString()} open today · p90 {formatMinutes(health.freshness.availableP90Minutes)}
          </div>
        </div>
        <div className="card p-5">
          <Clock size={18} className="text-forest-700" />
          <div className="text-xs text-stone-500 mt-3 uppercase tracking-wide">Hot coverage</div>
          <div className="text-3xl font-semibold mt-1">{hotCoverage}%</div>
          <div className="text-xs text-stone-500 mt-1">
            {health.freshness.checkedLastTwoHours.toLocaleString()} checked &lt;2h · {health.freshness.hotDueSites.toLocaleString()} due
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-stone-500">All current-day sites</div>
          <div className="mt-1 font-semibold text-stone-900">
            p50 {formatMinutes(health.freshness.currentP50Minutes)} · p90 {formatMinutes(health.freshness.currentP90Minutes)}
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-stone-500">Last hour</div>
          <div className="mt-1 font-semibold text-stone-900">
            {health.worker.runsLastHour} runs · {health.worker.sitesUpdatedLastHour.toLocaleString()} sites
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-stone-500">Future queues</div>
          <div className="mt-1 font-semibold text-stone-900">
            Near {health.freshness.nearDueSites.toLocaleString()} · Planning {health.freshness.planningDueSites.toLocaleString()} · Deep {health.freshness.deepDueSites.toLocaleString()}
          </div>
        </div>
      </div>

      <DataTabs
        ops={ops}
        datasets={datasets}
        scopes={health.scopes}
      />
    </div>
  );
}
