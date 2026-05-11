import { NextResponse } from "next/server";
import {
  campgroundsByPark as fetchCampgroundsByPark,
  operatorById as fetchOperatorById,
  sitesByCampground as fetchSitesByCampground,
  getParkBySlug,
} from "@/lib/data-source";
import { getSiteAvailabilityForPark } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [opMap, cgsByPark, sitesByCg, perNight] = await Promise.all([
    fetchOperatorById(),
    fetchCampgroundsByPark(),
    fetchSitesByCampground(),
    getSiteAvailabilityForPark(park.id),
  ]);

  const operator = opMap.get(park.operator_id);
  const cgs = cgsByPark.get(park.id) ?? [];

  const accBySite = new Map<string, { avail: number; total: number; latest: string | null }>();
  for (const r of perNight) {
    const a = accBySite.get(r.site_id) ?? { avail: 0, total: 0, latest: null };
    a.total += 1;
    if (r.status === "available") a.avail += 1;
    if (!a.latest || r.last_checked_at > a.latest) a.latest = r.last_checked_at;
    accBySite.set(r.site_id, a);
  }

  const summary = cgs.map((cg) => {
    const cgSites = sitesByCg.get(cg.id) ?? [];
    let availableNights = 0;
    let totalNights = 0;
    let latest: string | null = null;
    for (const s of cgSites) {
      const a = accBySite.get(s.id);
      if (!a) continue;
      availableNights += a.avail;
      totalNights += a.total;
      if (a.latest && (!latest || a.latest > latest)) latest = a.latest;
    }
    return {
      campground: cg,
      site_count: cgSites.length,
      availability_pct: totalNights ? Math.round((availableNights / totalNights) * 100) : 0,
      last_checked_at: latest,
    };
  });

  return NextResponse.json({ park, operator, campgrounds: summary });
}
