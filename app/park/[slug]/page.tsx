import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getParkBySlug,
  getOperatorWithStats,
  getEquipmentForOperator,
  getParkReviews,
  getParkReviewAggregate,
  getRecentSiteReviewsForPark,
  getOperatorRuleSource,
  getParkAvailabilityOverviewForWindow,
} from "@/lib/data-source";
import { getFirstBookableNightForPark } from "@/lib/db/queries";
import { MapPin } from "lucide-react";
import { MotionHero } from "@/components/motion";
import { ParkTabs, type DateContext } from "@/components/park-tabs";
import { normalizeBookingUrlPath } from "@/lib/booking-url";
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

  const [firstBookableNight, operator, operatorEquipment, parkReviews, parkReviewAggregate, recentSiteReviews, operatorRuleSource] = await Promise.all([
    getFirstBookableNightForPark(park.id),
    getOperatorWithStats(park.operator_id),
    getEquipmentForOperator(park.operator_id),
    getParkReviews(park.id),
    getParkReviewAggregate(park.id),
    getRecentSiteReviewsForPark(park.id),
    getOperatorRuleSource(park.operator_id),
  ]);
  if (!operator) notFound();

  const dateContext = resolveDateContext(sp, firstBookableNight);
  const overview = await getParkAvailabilityOverviewForWindow(
    park.id,
    dateContext.mode === "range" ? dateContext.from : dateContext.date,
    dateContext.mode === "range" ? dateContext.to : dateContext.date,
  );

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

  const campMapSummaries = overview.campMapSummaries;
  const totalSites = overview.totalSites;
  const avgAvailability =
    totalSites > 0
      ? Math.round((overview.availableSites / totalSites) * 100)
      : 0;

  const siteDataParams = new URLSearchParams(
    dateContext.mode === "range"
      ? { from: dateContext.from, to: dateContext.to }
      : { from: dateContext.date, to: dateContext.date },
  );

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
        sites={[]}
        availabilitySummary={{}}
        bookingUrls={{}}
        equipmentOptions={operatorEquipment}
        calendarRows={[]}
        calendarLastChecked={overview.calendarLastChecked}
        vendorSiteIds={{}}
        calendarDataUrl={`/api/park/${encodeURIComponent(park.slug)}/calendar`}
        siteDataUrl={`/api/park/${encodeURIComponent(park.slug)}/sites?${siteDataParams.toString()}`}
        dateContext={dateContext}
        parkReviews={parkReviews}
        parkReviewAggregate={parkReviewAggregate}
        recentSiteReviews={recentSiteReviews}
        parkId={park.id}
        siteStats={[]}
        operatorRuleSource={operatorRuleSource}
      />
    </div>
  );
}
