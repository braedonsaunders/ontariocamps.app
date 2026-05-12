import type { Metadata } from "next";
import { operatorHealth } from "@/lib/search";
import { getDataSourceInfo } from "@/lib/data-source";
import { sql } from "@/lib/db/client";
import { Activity, Clock, Database } from "lucide-react";
import { DataTabs } from "@/components/data-tabs";

export const metadata: Metadata = {
  title: "Data",
  description: "Data freshness status and downloadable datasets from ontariocamps.app.",
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
  const totalSites = totals[0]?.sites ?? 0;
  const totalParks = totals[0]?.parks ?? 0;
  const overallMedian = Math.round(
    ops.reduce((sum, o) => sum + o.median_freshness_minutes, 0) / Math.max(ops.length, 1),
  );

  const datasets = [
    {
      id: "parks",
      label: "Parks",
      description: `${totalParks.toLocaleString()} parks across ${ops.length.toLocaleString()} operators — names, regions, coordinates, operator, and vendor IDs.`,
      filename: "ontariocamps-parks.csv",
      rowCount: totalParks,
      dataUrl: "/api/data/parks",
    },
    {
      id: "operators",
      label: "Operators",
      description: `${ops.length.toLocaleString()} campground operators — vendor platform, base URL, and booking URL.`,
      filename: "ontariocamps-operators.csv",
      rowCount: ops.length,
      dataUrl: "/api/data/operators",
    },
    {
      id: "sites",
      label: "Sites",
      description: `${totalSites.toLocaleString()} individual campsites — type, amenities, max party/equipment size, and campground reference.`,
      filename: "ontariocamps-sites.csv",
      rowCount: totalSites,
      dataUrl: "/api/data/sites",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Data</h1>
      <p className="text-stone-600 mt-2 max-w-2xl">
        Status of our data index and one-click CSV downloads of public datasets.
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

      <div className="mt-6 grid sm:grid-cols-3 gap-4">
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

      <DataTabs
        ops={ops}
        datasets={datasets}
      />
    </div>
  );
}
