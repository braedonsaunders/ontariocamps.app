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
  available_count: number;
};

/**
 * Lightweight rollup of every indexed park + its current availability share.
 * Used by the search-page MapLibre layer so every park pin appears, coloured
 * by % of sites with ≥1 available night.
 */
export async function GET() {
  const rows = await sql()<Row[]>`
    SELECT
      p.slug, p.name, p.operator_id, o.name AS operator, p.region,
      p.lat, p.lng,
      count(distinct s.id)::int AS total_sites,
      count(distinct case when sa.status='available' then s.id end)::int AS available_count
    FROM parks p
    JOIN operators o ON o.id = p.operator_id
    JOIN campgrounds c ON c.park_id = p.id
    JOIN sites s ON s.campground_id = c.id
    LEFT JOIN site_availability sa ON sa.site_id = s.id
    GROUP BY p.id, p.slug, p.name, p.operator_id, o.name, p.region, p.lat, p.lng
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
    available_sites: r.available_count,
    availability_pct: r.total_sites > 0 ? Math.round((r.available_count / r.total_sites) * 100) : 0,
  }));
  return NextResponse.json(
    { parks: out, count: out.length },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } },
  );
}
