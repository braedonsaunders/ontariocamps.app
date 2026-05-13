import { NextResponse } from "next/server";
import {
  getCampMapsForPark,
  getParkBySlug,
  getSitesForPark,
  getSiteReviewStatsForPark,
} from "@/lib/data-source";
import { getFirstBookableNightForPark, getSiteAvailabilityForParkWindow } from "@/lib/db/queries";
import { appDate } from "@/lib/app-time";
import { buildBookingUrl } from "@/lib/booking-url";
import { getSitePetPolicy } from "@/lib/site-pet-policy";
import type { SiteStatsEntry } from "@/components/site-field-notes";

export const dynamic = "force-dynamic";

function isValidDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function inclusiveNightCount(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 1;
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = new URL(request.url);
  let from = url.searchParams.get("from");
  let to = url.searchParams.get("to");

  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    const firstBookableNight = await getFirstBookableNightForPark(park.id);
    const today = appDate();
    from = firstBookableNight && firstBookableNight > today ? firstBookableNight : today;
    to = from;
  }

  const [campMaps, sites, perNight, siteReviewStats] = await Promise.all([
    getCampMapsForPark(park.id),
    getSitesForPark(park.id),
    getSiteAvailabilityForParkWindow(park.id, from, to),
    getSiteReviewStatsForPark(park.id),
  ]);

  const nightsBySite = new Map<string, Array<{ night_date: string; status: string; last_checked_at: string }>>();
  for (const row of perNight) {
    let rows = nightsBySite.get(row.site_id);
    if (!rows) {
      rows = [];
      nightsBySite.set(row.site_id, rows);
    }
    rows.push(row);
  }

  const expectedNights = inclusiveNightCount(from, to);
  const availabilitySummary: Record<
    string,
    { status: "available" | "reserved" | "closed" | "unknown"; nights_available: number; last_checked_at: string | null }
  > = {};
  const siteBookingData: Record<string, { total: number; available: number; reserved: number }> = {};
  let calendarLastChecked: string | null = null;

  for (const site of sites) {
    const rows = nightsBySite.get(site.id) ?? [];
    let latest: string | null = null;
    let available = 0;
    let reserved = 0;
    for (const row of rows) {
      if (row.status === "available") available += 1;
      if (row.status === "reserved") reserved += 1;
      if (!latest || row.last_checked_at > latest) latest = row.last_checked_at;
      if (!calendarLastChecked || row.last_checked_at > calendarLastChecked) {
        calendarLastChecked = row.last_checked_at;
      }
    }

    let status: "available" | "reserved" | "closed" | "unknown";
    if (rows.length === 0) {
      status = "unknown";
    } else if (rows.some((row) => row.status === "closed")) {
      status = "closed";
    } else if (rows.length >= expectedNights && rows.every((row) => row.status === "available")) {
      status = "available";
    } else {
      status = "reserved";
    }

    availabilitySummary[site.id] = {
      status,
      nights_available: available,
      last_checked_at: latest,
    };
    siteBookingData[site.id] = {
      total: rows.length,
      available,
      reserved,
    };
  }

  const campMapSummaries = campMaps.map((campMap) => {
    const mapSites = sites.filter((site) => site.camp_map_id === campMap.id);
    const availableSites = mapSites.filter((site) => availabilitySummary[site.id]?.status === "available").length;
    return {
      ...campMap,
      total_sites: mapSites.length,
      available_sites: availableSites,
    };
  }).sort((a, b) => b.total_sites - a.total_sites);

  const campMapById = new Map(campMaps.map((campMap) => [campMap.id, campMap]));
  const bookingUrls: Record<string, string> = {};
  for (const site of sites) {
    const campMap = site.camp_map_id ? campMapById.get(site.camp_map_id) : null;
    bookingUrls[site.id] = buildBookingUrl(park.vendor_url, {
      resourceId: site.vendor_site_id,
      mapId: campMap?.vendor_map_id || undefined,
    });
  }

  const reviewStatsMap = new Map(siteReviewStats.map((row) => [row.site_id, row]));
  const siteStats: SiteStatsEntry[] = sites.map((site) => {
    const booking = siteBookingData[site.id] ?? { total: 0, available: 0, reserved: 0 };
    const review = reviewStatsMap.get(site.id);
    return {
      id: site.id,
      vendorSiteId: site.vendor_site_id,
      name: site.name,
      siteTypeLabel: site.site_type_label ?? site.site_type,
      hasElectric: site.has_electric,
      isWaterfront: site.is_waterfront,
      isPetFriendly: getSitePetPolicy(site) === "pet-friendly",
      totalNights: booking.total,
      availableNights: booking.available,
      reservedNights: booking.reserved,
      reviewCount: review?.review_count ?? 0,
      ratingAvg: review?.rating_avg ?? null,
    };
  });

  return NextResponse.json({
    campMapSummaries,
    sites,
    availabilitySummary,
    bookingUrls,
    calendarLastChecked,
    siteStats,
  });
}
