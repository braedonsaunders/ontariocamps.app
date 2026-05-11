import type { Metadata } from "next";
import { operatorHealth } from "@/lib/search";
import { getDataSourceInfo, fetchParks, fetchOperators, fetchSites } from "@/lib/data-source";
import type { Park, Operator, Site } from "@/lib/types";
import { sql } from "@/lib/db/client";
import { Activity, Clock, Database, Download } from "lucide-react";
import { DataTabs } from "@/components/data-tabs";

export const metadata: Metadata = {
  title: "Data",
  description: "Data freshness status and downloadable datasets from ontariocamps.app.",
};
export const dynamic = "force-dynamic";

export default async function DataPage() {
  const [ops, totals, info, parks, operators, allSites] = await Promise.all([
    operatorHealth(),
    sql()<Array<{ parks: number; sites: number }>>`SELECT parks, sites FROM analytics_totals`,
    getDataSourceInfo(),
    fetchParks(),
    fetchOperators(),
    fetchSites(),
  ]);
  const dataSource = info.hasReal ? "real" : "mock";
  const dataSourceGeneratedAt = info.availabilityLastRefreshedAt ?? info.metadataLastRefreshedAt;
  const ingestRuns = info.refreshRuns;
  const totalSites = totals[0]?.sites ?? 0;
  const totalParks = totals[0]?.parks ?? 0;
  const overallMedian = Math.round(
    ops.reduce((sum, o) => sum + o.median_freshness_minutes, 0) / Math.max(ops.length, 1),
  );

  const datasets = [
    {
      id: "parks",
      label: "Parks",
      description: `${parks.length} parks across ${operators.length} operators — names, regions, coordinates, operator, and vendor IDs.`,
      filename: "ontariocamps-parks.csv",
      rowCount: parks.length,
      data: parks.map((p: Park) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        region: p.region,
        operator_id: p.operator_id,
        lat: p.location.lat,
        lng: p.location.lng,
        address: p.address,
        vendor_url: p.vendor_url,
      })),
    },
    {
      id: "operators",
      label: "Operators",
      description: `${operators.length} campground operators — vendor platform, base URL, and booking URL.`,
      filename: "ontariocamps-operators.csv",
      rowCount: operators.length,
      data: operators.map((o: Operator) => ({
        id: o.id,
        name: o.name,
        vendor: o.vendor,
        base_url: o.base_url,
        booking_url: o.booking_url,
        active: o.active,
      })),
    },
    {
      id: "sites",
      label: "Sites",
      description: `${allSites.length} individual campsites — type, amenities, max party/equipment size, and campground reference.`,
      filename: "ontariocamps-sites.csv",
      rowCount: allSites.length,
      data: allSites.map((s: Site) => ({
        id: s.id,
        name: s.name,
        campground_id: s.campground_id,
        site_type: s.site_type,
        site_type_label: s.site_type_label ?? "",
        max_party_size: s.max_party_size,
        max_equipment_length_ft: s.max_equipment_length_ft ?? "",
        has_electric: s.has_electric,
        has_water: s.has_water,
        has_sewer: s.has_sewer,
        is_pull_through: s.is_pull_through,
        is_accessible: s.is_accessible,
        is_pet_friendly: s.is_pet_friendly,
        is_waterfront: s.is_waterfront,
      })),
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
        ingestRuns={ingestRuns}
        datasets={datasets}
      />
    </div>
  );
}
