import type { Metadata } from "next";
import { OntarioMap } from "@/components/ontario-map";
import { sql } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "Map of every park",
  description: "Every campsite operator's parks on a single map of Ontario.",
};

export const dynamic = "force-dynamic";

type ParkRow = {
  slug: string;
  name: string;
  operator: string;
  operator_id: string;
  region: string;
  lat: number;
  lng: number;
  total_sites: number;
  available_sites: number;
  availability_pct: number;
};

export default async function MapPage() {
  // One SELECT — all the data we need for every pin. The denormalised
  // availability columns mean no aggregation at request time.
  const parks = await sql()<ParkRow[]>`
    SELECT p.slug, p.name, p.operator_id, o.name AS operator,
           p.region, p.lat, p.lng,
           p.total_sites, p.available_sites,
           CASE WHEN p.total_sites > 0
             THEN (100.0 * p.available_sites / p.total_sites)::int
             ELSE 0
           END AS availability_pct
      FROM parks p
      JOIN operators o ON o.id = p.operator_id
     WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
     ORDER BY p.total_sites DESC
  `;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="px-4 sm:px-6 lg:px-8 py-3 border-b border-stone-200 bg-white flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Every park on one map</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {parks.length} parks across Ontario · pin colour reflects current availability
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-stone-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#10b981" }} />
            Open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
            Limited
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#ef4444" }} />
            Booked
          </span>
        </div>
      </div>
      <div className="flex-1 relative">
        <OntarioMap parks={parks} />
      </div>
    </div>
  );
}
