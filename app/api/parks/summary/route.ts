import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

export const dynamic = "force-dynamic";

type Row = {
  slug: string;
  name: string;
  operator_id: string;
  operator: string;
  region: string;
  lat: number;
  lng: number;
  total_sites: number;
  available_sites: number;
};

/**
 * Read straight from the denormalized parks columns. No joins, no aggregation
 * at request time — `refresh_aggregates()` keeps the columns up to date.
 */
export async function GET() {
  const rows = await sql()<Row[]>`
    SELECT p.slug, p.name, p.operator_id, o.name AS operator,
           p.region, p.lat, p.lng, p.total_sites, p.available_sites
      FROM parks p
      JOIN operators o ON o.id = p.operator_id
  `;
  const out = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    operator_id: r.operator_id,
    operator: r.operator,
    region: r.region,
    lat: r.lat,
    lng: r.lng,
    total_sites: r.total_sites,
    available_sites: r.available_sites,
    availability_pct: r.total_sites > 0 ? Math.round((r.available_sites / r.total_sites) * 100) : 0,
  }));
  return NextResponse.json(
    { parks: out, count: out.length },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
  );
}
