import { NextResponse } from "next/server";
import { runSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  const parseList = (key: string) =>
    q.get(key)?.split(",").map((s) => s.trim()).filter(Boolean);

  const data = await runSearch({
    lat: q.has("lat") ? Number(q.get("lat")) : undefined,
    lng: q.has("lng") ? Number(q.get("lng")) : undefined,
    end_lat: q.has("end_lat") ? Number(q.get("end_lat")) : undefined,
    end_lng: q.has("end_lng") ? Number(q.get("end_lng")) : undefined,
    radius_km: q.has("radius_km") ? Number(q.get("radius_km")) : undefined,
    start_date: q.get("start_date") ?? undefined,
    end_date: q.get("end_date") ?? undefined,
    min_nights: q.has("min_nights") ? Number(q.get("min_nights")) : undefined,
    flexible: q.get("flexible") === "true",
    party_size: q.has("party_size") ? Number(q.get("party_size")) : undefined,
    site_types: parseList("site_types"),
    amenities: parseList("amenities"),
    operators: parseList("operators"),
    park_slugs: parseList("park_slugs"),
    equipment_length_ft: q.has("equipment_length_ft") ? Number(q.get("equipment_length_ft")) : undefined,
    stay_mode: (q.get("stay_mode") as "same_site" | "same_park" | "anywhere" | null) ?? undefined,
    group_by: (q.get("group_by") as "park" | "campground" | "operator" | "none" | null) ?? undefined,
    group_limit: q.has("group_limit") ? Number(q.get("group_limit")) : undefined,
    group_offset: q.has("group_offset") ? Number(q.get("group_offset")) : undefined,
    group_result_limit: q.has("group_result_limit") ? Number(q.get("group_result_limit")) : undefined,
    limit: q.has("limit") ? Number(q.get("limit")) : undefined,
    offset: q.has("offset") ? Number(q.get("offset")) : undefined,
    sort: (q.get("sort") as "distance" | "route" | "moves" | "freshness" | "name" | "availability" | "price" | null) ?? undefined,
  });

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=120" },
  });
}
