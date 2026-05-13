import { NextResponse } from "next/server";
import {
  getCampgroundsForPark,
  getCampMapsForPark,
  getParkBySlug,
  getSitesForPark,
} from "@/lib/data-source";
import { getSiteAvailabilityForPark } from "@/lib/db/queries";
import { buildBookingUrl } from "@/lib/booking-url";
import type { CalendarRow } from "@/components/availability-calendar";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [campgrounds, campMaps, sites, perNight] = await Promise.all([
    getCampgroundsForPark(park.id),
    getCampMapsForPark(park.id),
    getSitesForPark(park.id),
    getSiteAvailabilityForPark(park.id),
  ]);

  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const campMapById = new Map(campMaps.map((map) => [map.id, map]));
  const campgroundById = new Map(campgrounds.map((campground) => [campground.id, campground]));
  const calendarRowsMap = new Map<string, CalendarRow>();
  let calendarLastChecked: string | null = null;

  for (const row of perNight) {
    const site = sitesById.get(row.site_id);
    if (!site) continue;

    const campMap = site.camp_map_id ? campMapById.get(site.camp_map_id) : null;
    const campground = campgroundById.get(site.campground_id);
    const areaId = campMap?.id ?? campground?.id ?? site.campground_id;
    const areaName = campMap?.name ?? campground?.name ?? "Other sites";
    const areaDescription = campMap?.description ?? null;

    if (!calendarRowsMap.has(row.site_id)) {
      calendarRowsMap.set(row.site_id, {
        site: {
          id: site.id,
          name: site.name,
          site_type: site.site_type,
          site_type_label: site.site_type_label ?? null,
          has_electric: site.has_electric,
          area_id: areaId,
          area_name: areaName,
          area_description: areaDescription,
        },
        nights: {},
      });
    }

    calendarRowsMap.get(row.site_id)!.nights[row.night_date] = row.status;
    if (!calendarLastChecked || row.last_checked_at > calendarLastChecked) {
      calendarLastChecked = row.last_checked_at;
    }
  }

  const calendarRows = Array.from(calendarRowsMap.values()).sort((a, b) =>
    a.site.name.localeCompare(b.site.name, undefined, { numeric: true }),
  );

  const bookingUrls: Record<string, string> = {};
  const vendorSiteIds: Record<string, string> = {};
  for (const site of sites) {
    const campMap = site.camp_map_id ? campMapById.get(site.camp_map_id) : null;
    bookingUrls[site.id] = buildBookingUrl(park.vendor_url, {
      resourceId: site.vendor_site_id,
      mapId: campMap?.vendor_map_id || undefined,
    });
    vendorSiteIds[site.id] = site.vendor_site_id;
  }

  return NextResponse.json({
    calendarRows,
    calendarLastChecked,
    vendorSiteIds,
    bookingUrls,
  });
}
