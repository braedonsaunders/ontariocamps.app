import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getParkBySlug,
  getOperatorWithStats,
  getCampMapsForPark,
  getSitesForPark,
  getEquipmentForOperator,
  getParkReviews,
  getParkReviewAggregate,
  getRecentSiteReviewsForPark,
  getSiteReviewStatsForPark,
} from "@/lib/data-source";
import { getSiteAvailabilityForPark } from "@/lib/db/queries";
import { MapPin } from "lucide-react";
import { type CalendarRow } from "@/components/availability-calendar";
import { MotionHero } from "@/components/motion";
import { ParkTabs, type DateContext } from "@/components/park-tabs";
import type { SiteStatsEntry } from "@/components/site-field-notes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) return { title: "Park not found" };
  return { title: park.name, description: park.description };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(s: string | undefined | null): s is string {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z").getTime());
}

/** Build a DateContext from URL search params:
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD  → range mode (both inclusive bounds)
 *   anything else                   → "tonight" mode (falls back to the first
 *                                     bookable night in the data window if
 *                                     today's row doesn't exist yet — operators
 *                                     hold the first ~14 days back so today
 *                                     usually has no data)
 */
function resolveDateContext(
  searchParams: Record<string, string | string[] | undefined>,
  firstBookableNight: string | null,
): DateContext {
  const from = Array.isArray(searchParams.from) ? searchParams.from[0] : searchParams.from;
  const to = Array.isArray(searchParams.to) ? searchParams.to[0] : searchParams.to;
  if (isValidDate(from) && isValidDate(to) && from <= to) {
    return { mode: "range", from, to };
  }
  const today = todayUtc();
  // If today has data, use today; otherwise fall back to the operator's first
  // bookable night so dots render with actual status.
  const date = firstBookableNight && firstBookableNight > today ? firstBookableNight : today;
  return { mode: "today", date };
}

export default async function ParkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const park = await getParkBySlug(slug);
  if (!park) notFound();

  const [operator, parkCampMaps, allParkSites, operatorEquipment, perNight, parkReviews, parkReviewAggregate, recentSiteReviews, siteReviewStats] = await Promise.all([
    getOperatorWithStats(park.operator_id),
    getCampMapsForPark(park.id),
    getSitesForPark(park.id),
    getEquipmentForOperator(park.operator_id),
    getSiteAvailabilityForPark(park.id),
    getParkReviews(park.id),
    getParkReviewAggregate(park.id),
    getRecentSiteReviewsForPark(park.id),
    getSiteReviewStatsForPark(park.id),
  ]);
  if (!operator) notFound();

  // Map: site_id → all (date, status, last_checked_at) rows for fast filtering.
  const nightsBySite = new Map<string, Array<{ night_date: string; status: string; last_checked_at: string }>>();
  let firstBookableNight: string | null = null;
  for (const r of perNight) {
    let arr = nightsBySite.get(r.site_id);
    if (!arr) {
      arr = [];
      nightsBySite.set(r.site_id, arr);
    }
    arr.push(r);
    if (!firstBookableNight || r.night_date < firstBookableNight) firstBookableNight = r.night_date;
  }

  const dateContext = resolveDateContext(sp, firstBookableNight);

  // The "in-context" availability summary used to colour map dots. Definition:
  //   range mode: site is available iff EVERY night in [from, to] is "available".
  //                Status is "closed" if any night is "closed", else "reserved".
  //   today mode: just look at today's row.
  // `nights_available` keeps a count of open nights across the next 90-day
  // window so the popover can still tell the user "X open nights overall".
  const availabilitySummary: Record<
    string,
    { status: "available" | "reserved" | "closed" | "unknown"; nights_available: number; last_checked_at: string | null }
  > = {};

  for (const s of allParkSites) {
    const rows = nightsBySite.get(s.id) ?? [];
    let latest: string | null = null;
    let totalAvailable = 0;
    for (const r of rows) {
      if (r.status === "available") totalAvailable += 1;
      if (!latest || r.last_checked_at > latest) latest = r.last_checked_at;
    }

    let contextStatus: "available" | "reserved" | "closed" | "unknown";
    if (dateContext.mode === "range") {
      const inRange = rows.filter((r) => r.night_date >= dateContext.from && r.night_date <= dateContext.to);
      if (inRange.length === 0) {
        contextStatus = "unknown";
      } else if (inRange.some((r) => r.status === "closed")) {
        contextStatus = "closed";
      } else if (inRange.every((r) => r.status === "available")) {
        contextStatus = "available";
      } else {
        contextStatus = "reserved";
      }
    } else {
      const todayRow = rows.find((r) => r.night_date === dateContext.date);
      if (!todayRow) {
        contextStatus = "unknown";
      } else {
        contextStatus = todayRow.status as "available" | "reserved" | "closed" | "unknown";
      }
    }

    availabilitySummary[s.id] = {
      status: contextStatus,
      nights_available: totalAvailable,
      last_checked_at: latest,
    };
  }

  // Per-camp-map (section) summaries: site count + how many of those sites are
  // "available" under the current date context.
  const campMapSummaries = parkCampMaps.map((cm) => {
    const cmSites = allParkSites.filter((s) => s.camp_map_id === cm.id);
    let availSites = 0;
    for (const s of cmSites) {
      if (availabilitySummary[s.id]?.status === "available") availSites += 1;
    }
    return {
      ...cm,
      total_sites: cmSites.length,
      available_sites: availSites,
    };
  }).sort((a, b) => b.total_sites - a.total_sites);

  const totalSites = allParkSites.length;
  const avgAvailability =
    campMapSummaries.length > 0
      ? Math.round(
          campMapSummaries.reduce(
            (sum, m) => sum + (m.total_sites > 0 ? (m.available_sites / m.total_sites) * 100 : 0),
            0,
          ) / campMapSummaries.length,
        )
      : 0;

  // Calendar rows for the Calendar tab. One row per site, with the per-night
  // status map.
  const sitesById = new Map(allParkSites.map((s) => [s.id, s]));
  const calendarRowsMap = new Map<string, CalendarRow>();
  let calendarLastChecked: string | null = null;
  for (const r of perNight) {
    const site = sitesById.get(r.site_id);
    if (!site) continue;
    if (!calendarRowsMap.has(r.site_id)) {
      calendarRowsMap.set(r.site_id, {
        site: {
          id: site.id,
          name: site.name,
          site_type: site.site_type,
          site_type_label: site.site_type_label ?? null,
          has_electric: site.has_electric,
        },
        nights: {},
      });
    }
    calendarRowsMap.get(r.site_id)!.nights[r.night_date] = r.status;
    if (!calendarLastChecked || r.last_checked_at > calendarLastChecked) {
      calendarLastChecked = r.last_checked_at;
    }
  }
  const calendarRows = Array.from(calendarRowsMap.values()).sort((a, b) =>
    a.site.name.localeCompare(b.site.name, undefined, { numeric: true }),
  );

  const bookingUrls: Record<string, string> = {};
  const vendorSiteIds: Record<string, string> = {};
  const sep = park.vendor_url.includes("?") ? "&" : "?";
  for (const s of allParkSites) {
    bookingUrls[s.id] = `${park.vendor_url}${sep}resourceId=${s.vendor_site_id}&isReserving=true`;
    vendorSiteIds[s.id] = s.vendor_site_id;
  }

  const siteBookingData: Record<string, { total: number; available: number; reserved: number }> = {};
  for (const s of allParkSites) {
    const rows = nightsBySite.get(s.id) ?? [];
    let available = 0;
    let reserved = 0;
    for (const r of rows) {
      if (r.status === "available") available++;
      else if (r.status === "reserved") reserved++;
    }
    siteBookingData[s.id] = { total: rows.length, available, reserved };
  }

  const reviewStatsMap = new Map(siteReviewStats.map((r) => [r.site_id, r]));
  const siteStats: SiteStatsEntry[] = allParkSites.map((s) => {
    const booking = siteBookingData[s.id] ?? { total: 0, available: 0, reserved: 0 };
    const review = reviewStatsMap.get(s.id);
    return {
      id: s.id,
      name: s.name,
      siteTypeLabel: s.site_type_label ?? s.site_type,
      hasElectric: s.has_electric,
      isWaterfront: s.is_waterfront,
      isPetFriendly: s.is_pet_friendly,
      totalNights: booking.total,
      availableNights: booking.available,
      reservedNights: booking.reserved,
      reviewCount: review?.review_count ?? 0,
      ratingAvg: review?.rating_avg ?? null,
    };
  });

  return (
    <div>
      <section className="relative h-64 sm:h-80 lg:h-96 bg-gradient-to-br from-forest-700 to-forest-900 overflow-hidden">
        {park.hero_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={park.hero_image_url}
            alt={park.name}
            className="absolute inset-0 h-full w-full object-cover opacity-75 animate-heroZoom origin-center"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900/85 via-stone-900/30 to-transparent" />
        <div className="relative h-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-5 text-white">
          <MotionHero>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="chip bg-white/15 ring-1 ring-white/20">{park.region}</span>
              <Link
                href={`/operator/${operator.id}`}
                className="chip bg-white/15 ring-1 ring-white/20 hover:bg-white/25 transition-colors"
              >
                {operator.name}
              </Link>
            </div>
            <h1 className="mt-3 text-2xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">{park.name}</h1>
            {park.address && (
              <div className="flex items-center gap-1.5 mt-2 text-white/90 text-sm">
                <MapPin size={14} /> {park.address}
              </div>
            )}
          </MotionHero>
        </div>
      </section>

      <ParkTabs
        parkName={park.name}
        parkSlug={park.slug}
        parkDescription={park.description}
        parkAddress={park.address}
        operatorName={operator.name}
        operatorId={operator.id}
        operatorVendor={operator.vendor}
        vendorUrl={park.vendor_url}
        parkLocation={park.location}
        totalSites={totalSites}
        avgAvailability={avgAvailability}
        campMapSummaries={campMapSummaries}
        sites={allParkSites}
        availabilitySummary={availabilitySummary}
        bookingUrls={bookingUrls}
        equipmentOptions={operatorEquipment}
        calendarRows={calendarRows}
        calendarLastChecked={calendarLastChecked}
        vendorSiteIds={vendorSiteIds}
        dateContext={dateContext}
        parkReviews={parkReviews}
        parkReviewAggregate={parkReviewAggregate}
        recentSiteReviews={recentSiteReviews}
        parkId={park.id}
        siteStats={siteStats}
      />
    </div>
  );
}
