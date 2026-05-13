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
  getOperatorRuleSource,
} from "@/lib/data-source";
import { getSiteAvailabilityForPark } from "@/lib/db/queries";
import { MapPin } from "lucide-react";
import { MotionHero } from "@/components/motion";
import { ParkTabs, type DateContext } from "@/components/park-tabs";
import type { SiteStatsEntry } from "@/components/site-field-notes";
import { buildBookingUrl, normalizeBookingUrlPath } from "@/lib/booking-url";
import { appDate } from "@/lib/app-time";
import { imageProxyUrl } from "@/lib/image-proxy";
import { SITE_NAME, absoluteUrl, toMetaDescription } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) return { title: "Park not found" };

  const title = `${park.name} campsites`;
  const description = toMetaDescription(
    park.description,
    `Find campsite availability, maps, reviews, and booking links for ${park.name} in ${park.region || "Ontario"}.`,
  );

  return {
    title,
    description,
    alternates: {
      canonical: `/park/${park.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `/park/${park.slug}`,
      type: "website",
      images: park.hero_image_url
        ? [
            {
              url: park.hero_image_url,
              alt: park.name,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: park.hero_image_url ? [park.hero_image_url] : undefined,
    },
  };
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
  const today = appDate();
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

  const [operator, parkCampMaps, allParkSites, operatorEquipment, perNight, parkReviews, parkReviewAggregate, recentSiteReviews, siteReviewStats, operatorRuleSource] = await Promise.all([
    getOperatorWithStats(park.operator_id),
    getCampMapsForPark(park.id),
    getSitesForPark(park.id),
    getEquipmentForOperator(park.operator_id),
    getSiteAvailabilityForPark(park.id),
    getParkReviews(park.id),
    getParkReviewAggregate(park.id),
    getRecentSiteReviewsForPark(park.id),
    getSiteReviewStatsForPark(park.id),
    getOperatorRuleSource(park.operator_id),
  ]);
  if (!operator) notFound();

  const canonicalUrl = absoluteUrl(`/park/${park.slug}`);
  const jsonLdDescription = toMetaDescription(
    park.description,
    `Find campsite availability, maps, reviews, and booking links for ${park.name} in ${park.region || "Ontario"}.`,
    300,
  );
  const parkJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumbs`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: SITE_NAME,
            item: absoluteUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Parks",
            item: absoluteUrl("/parks"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: park.name,
            item: canonicalUrl,
          },
        ],
      },
      {
        "@type": "Campground",
        "@id": `${canonicalUrl}#campground`,
        name: park.name,
        description: jsonLdDescription,
        url: canonicalUrl,
        image: park.hero_image_url,
        address: park.address || park.region || "Ontario, Canada",
        geo: {
          "@type": "GeoCoordinates",
          latitude: park.location.lat,
          longitude: park.location.lng,
        },
        provider: {
          "@type": "Organization",
          name: operator.name,
          url: operator.base_url,
        },
      },
    ],
  };
  const parkHeroImageUrl = imageProxyUrl(park.hero_image_url, "hero") ?? park.hero_image_url;

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

  const campMapById = new Map(parkCampMaps.map((m) => [m.id, m]));
  let calendarLastChecked: string | null = null;
  for (const r of perNight) {
    if (!calendarLastChecked || r.last_checked_at > calendarLastChecked) {
      calendarLastChecked = r.last_checked_at;
    }
  }

  const bookingUrls: Record<string, string> = {};
  for (const s of allParkSites) {
    const campMap = s.camp_map_id ? campMapById.get(s.camp_map_id) : null;
    bookingUrls[s.id] = buildBookingUrl(park.vendor_url, {
      resourceId: s.vendor_site_id,
      mapId: campMap?.vendor_map_id || undefined,
    });
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
      vendorSiteId: s.vendor_site_id,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(parkJsonLd).replace(/</g, "\\u003c") }}
      />
      <section className="relative h-[9.6rem] sm:h-48 lg:h-[14.4rem] bg-gradient-to-br from-forest-700 to-forest-900 overflow-hidden">
        {parkHeroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={parkHeroImageUrl}
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
        vendorUrl={normalizeBookingUrlPath(park.vendor_url)}
        parkLocation={park.location}
        totalSites={totalSites}
        avgAvailability={avgAvailability}
        campMapSummaries={campMapSummaries}
        sites={allParkSites}
        availabilitySummary={availabilitySummary}
        bookingUrls={bookingUrls}
        equipmentOptions={operatorEquipment}
        calendarRows={[]}
        calendarLastChecked={calendarLastChecked}
        vendorSiteIds={{}}
        calendarDataUrl={`/api/park/${encodeURIComponent(park.slug)}/calendar`}
        dateContext={dateContext}
        parkReviews={parkReviews}
        parkReviewAggregate={parkReviewAggregate}
        recentSiteReviews={recentSiteReviews}
        parkId={park.id}
        siteStats={siteStats}
        operatorRuleSource={operatorRuleSource}
      />
    </div>
  );
}
