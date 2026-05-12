import { NextResponse } from "next/server";
import { fetchOperators, fetchParks, fetchSites } from "@/lib/data-source";
import type { Operator, Park, Site } from "@/lib/types";

export const dynamic = "force-dynamic";

type Dataset = "parks" | "operators" | "sites";

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const header = keys.join(",");
  const body = rows.map((row) => keys.map((key) => escape(row[key])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function csvResponse(filename: string, rows: Record<string, unknown>[]) {
  return new Response(toCSV(rows), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

function isDataset(value: string): value is Dataset {
  return value === "parks" || value === "operators" || value === "sites";
}

export async function GET(_request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (!isDataset(dataset)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (dataset === "parks") {
    const parks = await fetchParks();
    return csvResponse(
      "ontariocamps-parks.csv",
      parks.map((park: Park) => ({
        id: park.id,
        name: park.name,
        slug: park.slug,
        region: park.region,
        operator_id: park.operator_id,
        lat: park.location.lat,
        lng: park.location.lng,
        address: park.address,
        vendor_url: park.vendor_url,
      })),
    );
  }

  if (dataset === "operators") {
    const operators = await fetchOperators();
    return csvResponse(
      "ontariocamps-operators.csv",
      operators.map((operator: Operator) => ({
        id: operator.id,
        name: operator.name,
        vendor: operator.vendor,
        base_url: operator.base_url,
        booking_url: operator.booking_url,
        active: operator.active,
      })),
    );
  }

  const sites = await fetchSites();
  return csvResponse(
    "ontariocamps-sites.csv",
    sites.map((site: Site) => ({
      id: site.id,
      name: site.name,
      campground_id: site.campground_id,
      site_type: site.site_type,
      site_type_label: site.site_type_label ?? "",
      max_party_size: site.max_party_size,
      max_equipment_length_ft: site.max_equipment_length_ft ?? "",
      has_electric: site.has_electric,
      has_water: site.has_water,
      has_sewer: site.has_sewer,
      is_pull_through: site.is_pull_through,
      is_accessible: site.is_accessible,
      is_pet_friendly: site.is_pet_friendly,
      is_waterfront: site.is_waterfront,
    })),
  );
}
