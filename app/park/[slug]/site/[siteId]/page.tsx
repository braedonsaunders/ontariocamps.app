import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getParkBySlug,
  getOperatorWithStats,
  getSiteByPark,
  getSiteAvailability,
  getEquipmentForOperator,
  getSiteReviews,
  getSiteReviewAggregate,
} from "@/lib/data-source";
import { ChevronLeft, ArrowUpRight } from "lucide-react";
import { MotionFadeUp } from "@/components/motion";
import { SiteTabs } from "@/components/site-tabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; siteId: string }>;
}): Promise<Metadata> {
  const { slug, siteId } = await params;
  const park = await getParkBySlug(slug);
  if (!park) return { title: "Site not found" };
  const site = await getSiteByPark(park.id, siteId);
  if (!site) return { title: "Site not found" };
  return {
    title: `Site ${site.name} · ${park.name}`,
    description: site.description ?? `${site.site_type_label ?? site.site_type} site at ${park.name}.`,
  };
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ slug: string; siteId: string }>;
}) {
  const { slug, siteId } = await params;
  const park = await getParkBySlug(slug);
  if (!park) notFound();
  const [operator, site] = await Promise.all([
    getOperatorWithStats(park.operator_id),
    getSiteByPark(park.id, siteId),
  ]);
  if (!operator || !site) notFound();

  const [availability, equipment, reviews, reviewAggregate] = await Promise.all([
    getSiteAvailability(site.id),
    getEquipmentForOperator(park.operator_id),
    getSiteReviews(site.id),
    getSiteReviewAggregate(site.id),
  ]);

  const monthMap = new Map<string, Array<{ night_date: string; status: string }>>();
  let lastChecked: string | null = null;
  for (const a of availability) {
    const ym = a.night_date.slice(0, 7);
    let arr = monthMap.get(ym);
    if (!arr) {
      arr = [];
      monthMap.set(ym, arr);
    }
    arr.push({ night_date: a.night_date, status: a.status });
    if (!lastChecked || a.last_checked_at > lastChecked) lastChecked = a.last_checked_at;
  }

  const months = Array.from(monthMap.entries())
    .slice(0, 4)
    .map(([ym, nights]) => ({
      key: ym,
      label: new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-CA", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      nights,
    }));

  const openNights = availability.filter((a) => a.status === "available").length;
  const sep = park.vendor_url.includes("?") ? "&" : "?";
  const bookingUrl = `${park.vendor_url}${sep}resourceId=${site.vendor_site_id}&isReserving=true`;

  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        <MotionFadeUp className="flex items-center gap-1.5 text-xs text-stone-500 mb-3 flex-wrap">
          <Link href={`/operator/${operator.id}`} className="hover:text-stone-900">{operator.name}</Link>
          <span>›</span>
          <Link href={`/park/${park.slug}`} className="hover:text-stone-900">{park.name}</Link>
          <span>›</span>
          <span className="text-stone-700">Site {site.name}</span>
        </MotionFadeUp>

        <MotionFadeUp>
          <Link
            href={`/park/${park.slug}`}
            className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-3"
          >
            <ChevronLeft size={14} /> Back to park
          </Link>
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Site {site.name}</h1>
              <div className="mt-1 text-stone-600">
                {site.site_type_label ?? site.site_type.toUpperCase()} · {park.name}
              </div>
            </div>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              Book on {operator.name} <ArrowUpRight size={14} />
            </a>
          </div>
        </MotionFadeUp>
      </div>

      <SiteTabs
        site={site}
        parkName={park.name}
        parkSlug={park.slug}
        operatorName={operator.name}
        operatorId={operator.id}
        bookingUrl={bookingUrl}
        photos={site.photos ?? []}
        months={months}
        openNights={openNights}
        lastChecked={lastChecked}
        equipment={equipment}
        reviews={reviews}
        reviewAggregate={reviewAggregate}
      />
    </div>
  );
}
