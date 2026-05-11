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
import { timeAgo } from "@/lib/utils";
import { ArrowUpRight, ChevronLeft, Tent, Users, Zap, Droplet, Waves, Accessibility, PawPrint } from "lucide-react";
import { PhotoGallery } from "@/components/photo-gallery";
import { SiteReviewAggregateDisplay, SiteReviewList, SiteReviewForm } from "@/components/reviews";
import { MotionFadeUp } from "@/components/motion";

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

function statusBadge(status: string) {
  if (status === "available") return { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Available" };
  if (status === "reserved") return { cls: "bg-red-50 text-red-700 ring-red-200", label: "Booked" };
  if (status === "closed") return { cls: "bg-stone-200 text-stone-700 ring-stone-300", label: "Closed" };
  return { cls: "bg-stone-100 text-stone-500 ring-stone-200", label: "Unknown" };
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

  // Group availability by month for the per-night table.
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
  const months = Array.from(monthMap.entries()).slice(0, 4); // limit to next ~4 months

  const openNights = availability.filter((a) => a.status === "available").length;
  const sep = park.vendor_url.includes("?") ? "&" : "?";
  const bookingUrl = `${park.vendor_url}${sep}resourceId=${site.vendor_site_id}&isReserving=true`;

  const photos = site.photos ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Breadcrumb */}
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

      <div className="mt-6">
        <PhotoGallery photos={photos} alt={`Site ${site.name} at ${park.name}`} />
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-8">
          {site.description && (
            <div>
              <h2 className="text-lg font-semibold mb-2">About this site</h2>
              <p className="text-stone-700 leading-relaxed">{site.description}</p>
            </div>
          )}

          {/* Per-night availability — compact month-by-month grid */}
          <div>
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
              <h2 className="text-lg font-semibold">Availability</h2>
              <div className="text-xs text-stone-500">
                {openNights} open nights in the next ~90 days
                {lastChecked && <> · checked {timeAgo(lastChecked)}</>}
              </div>
            </div>
            {months.length === 0 ? (
              <div className="card p-6 text-sm text-stone-500 text-center">
                No availability data has been ingested for this site yet.
              </div>
            ) : (
              <div className="space-y-4">
                {months.map(([ym, nights]) => {
                  const monthDate = new Date(ym + "-01T00:00:00Z");
                  const monthLabel = monthDate.toLocaleDateString("en-CA", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  });
                  return (
                    <div key={ym} className="card p-4">
                      <div className="text-sm font-semibold text-stone-900 mb-2">{monthLabel}</div>
                      <div className="grid grid-cols-7 gap-1 text-[10px]">
                        {nights.map((n) => {
                          const day = Number(n.night_date.slice(-2));
                          const b = statusBadge(n.status);
                          const isAvailable = n.status === "available";
                          const inner = (
                            <div
                              className={`aspect-square rounded ring-1 flex items-center justify-center font-medium tabular-nums ${b.cls}`}
                              title={`${n.night_date} · ${b.label}`}
                            >
                              {day}
                            </div>
                          );
                          if (isAvailable) {
                            return (
                              <a
                                key={n.night_date}
                                href={`${bookingUrl}&startDate=${n.night_date}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block hover:scale-[1.05] transition-transform"
                              >
                                {inner}
                              </a>
                            );
                          }
                          return <div key={n.night_date}>{inner}</div>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reviews */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold">Reviews</h2>
              {reviewAggregate.review_count > 0 && (
                <span className="text-xs text-stone-500">
                  {reviewAggregate.review_count} {reviewAggregate.review_count === 1 ? "review" : "reviews"}
                </span>
              )}
            </div>
            <div className="space-y-4">
              <SiteReviewAggregateDisplay aggregate={reviewAggregate} />
              <SiteReviewList reviews={reviews} />
              <SiteReviewForm siteId={site.id} />
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-stone-500 uppercase tracking-wide">Site facts</div>
            <dl className="mt-3 grid grid-cols-2 gap-y-2.5 text-sm">
              <dt className="text-stone-500">Type</dt>
              <dd className="text-stone-900">{site.site_type_label ?? site.site_type}</dd>
              <dt className="text-stone-500">Max party</dt>
              <dd className="text-stone-900 inline-flex items-center gap-1">
                <Users size={11} /> {site.max_party_size}
              </dd>
              {site.max_equipment_length_ft && (
                <>
                  <dt className="text-stone-500">Max length</dt>
                  <dd className="text-stone-900">{site.max_equipment_length_ft} ft</dd>
                </>
              )}
              <dt className="text-stone-500">Operator</dt>
              <dd>
                <Link href={`/operator/${operator.id}`} className="text-stone-900 hover:text-forest-700">
                  {operator.name}
                </Link>
              </dd>
            </dl>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {site.has_electric && (
                <span className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-200"><Zap size={10} /> Electric</span>
              )}
              {site.has_water && (
                <span className="chip bg-lake-50 text-lake-800 ring-1 ring-lake-200"><Droplet size={10} /> Water</span>
              )}
              {site.is_waterfront && (
                <span className="chip bg-lake-50 text-lake-800 ring-1 ring-lake-200"><Waves size={10} /> Waterfront</span>
              )}
              {site.is_pull_through && (
                <span className="chip bg-stone-100 text-stone-700 ring-1 ring-stone-200">Pull-through</span>
              )}
              {site.is_accessible && (
                <span className="chip bg-stone-100 text-stone-700 ring-1 ring-stone-200"><Accessibility size={10} /> Accessible</span>
              )}
              {site.is_pet_friendly && (
                <span className="chip bg-stone-100 text-stone-700 ring-1 ring-stone-200"><PawPrint size={10} /> Pet-friendly</span>
              )}
            </div>

            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-5 w-full justify-center"
            >
              Book on {operator.name} <ArrowUpRight size={14} />
            </a>
          </div>

          {equipment.length > 0 && (
            <div className="card p-5">
              <div className="text-xs text-stone-500 uppercase tracking-wide">Equipment allowed</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {equipment.map((e) => (
                  <span key={e.sub_equipment_category_id} className="chip bg-stone-100 text-stone-700">
                    {e.name}
                  </span>
                ))}
              </div>
              <p className="text-xs text-stone-500 mt-3 leading-relaxed">
                {operator.name} validates equipment at the booking step. Filter by yours in the search to see only
                compatible sites.
              </p>
            </div>
          )}

          <div className="card p-5 text-sm text-stone-600 leading-relaxed">
            <div className="font-semibold text-stone-900 mb-1.5 inline-flex items-center gap-1.5">
              <Tent size={14} /> Heads up
            </div>
            We don&apos;t handle rates or take bookings. Click through to {operator.name} to complete your reservation.
            Photos and descriptions come straight from {operator.name}&apos;s booking platform.
          </div>
        </aside>
      </div>
    </div>
  );
}
