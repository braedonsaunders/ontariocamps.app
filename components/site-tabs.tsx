"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import type { Site, EquipmentOption, SiteReview, SiteReviewAggregate } from "@/lib/types";
import type { GalleryPhoto } from "@/components/photo-gallery";
import { PhotoGallery } from "@/components/photo-gallery";
import { SiteReviewAggregateDisplay, SiteReviewList, SiteReviewForm } from "@/components/reviews";
import { timeAgo } from "@/lib/utils";
import {
  Info,
  Camera,
  Calendar,
  MessageSquare,
  ArrowUpRight,
  Users,
  Zap,
  Droplet,
  Waves,
  Accessibility,
  PawPrint,
  Tent,
  Star,
  Flame,
} from "lucide-react";

type MonthCalendar = {
  key: string;
  label: string;
  nights: Array<{ night_date: string; status: string }>;
};

type Props = {
  site: Site;
  parkName: string;
  parkSlug: string;
  operatorName: string;
  operatorId: string;
  bookingUrl: string;
  photos: GalleryPhoto[];
  months: MonthCalendar[];
  openNights: number;
  lastChecked: string | null;
  equipment: EquipmentOption[];
  reviews: SiteReview[];
  reviewAggregate: SiteReviewAggregate;
  bookingRate: number | null;
  reservedNights: number;
  bookableNights: number;
};

type Tab = "overview" | "photos" | "calendar" | "reviews";

function statusBadge(status: string) {
  if (status === "available") return { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Available" };
  if (status === "reserved") return { cls: "bg-red-50 text-red-700 ring-red-200", label: "Booked" };
  if (status === "closed") return { cls: "bg-stone-200 text-stone-700 ring-stone-300", label: "Closed" };
  return { cls: "bg-stone-100 text-stone-500 ring-stone-200", label: "Unknown" };
}

export function SiteTabs(props: Props) {
  const {
    site,
    parkName,
    parkSlug,
    operatorName,
    operatorId,
    bookingUrl,
    photos,
    months,
    openNights,
    lastChecked,
    equipment,
    reviews,
    reviewAggregate,
    bookingRate,
    reservedNights,
    bookableNights,
  } = props;

  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const TABS: Array<{ id: Tab; label: string; icon: typeof Info; hidden?: boolean }> = [
    { id: "overview", label: "Overview", icon: Info },
    { id: "photos", label: "Photos", icon: Camera, hidden: photos.length === 0 },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "reviews", label: "Reviews", icon: MessageSquare },
  ];

  const visibleTabs = TABS.filter((t) => !t.hidden);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Tab strip */}
      <div className="border-b border-stone-200 flex items-end gap-1 overflow-x-auto scrollbar-none">
        {visibleTabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "text-forest-700" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <t.icon size={14} />
              {t.label}
              {t.id === "reviews" && reviewAggregate.review_count > 0 && (
                <span className="ml-0.5 text-[10px] text-stone-400 tabular-nums">
                  ({reviewAggregate.review_count})
                </span>
              )}
              {active && (
                <motion.span
                  layoutId="site-tab-underline"
                  className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-forest-600"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {activeTab === "overview" && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                {site.description && (
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight mb-2">About this site</h2>
                    <p className="text-stone-700 leading-relaxed">{site.description}</p>
                  </div>
                )}

                {photos.length > 0 && (
                  <div>
                    <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">Photos</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab("photos")}
                        className="text-xs text-forest-700 hover:text-forest-800"
                      >
                        View all photos →
                      </button>
                    </div>
                    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                      {photos.slice(0, 4).map((p, i) => (
                        <div
                          key={(p.url ?? p.avifUrl ?? "") + String(i)}
                          className={`relative overflow-hidden rounded-lg ring-1 ring-stone-200 group aspect-square ${
                            i === 0 ? "col-span-2 row-span-2 aspect-auto" : ""
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url ?? p.avifUrl ?? ""}
                            alt={`Site ${site.name} photo ${i + 1}`}
                            className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {reviewAggregate.review_count > 0 && (
                  <div>
                    <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">Reviews</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab("reviews")}
                        className="text-xs text-forest-700 hover:text-forest-800"
                      >
                        Read all reviews →
                      </button>
                    </div>
                    <SiteReviewAggregateDisplay aggregate={reviewAggregate} />
                  </div>
                )}

                {!site.description && photos.length === 0 && reviewAggregate.review_count === 0 && (
                  <div className="card p-8 text-center text-stone-500">
                    <Info size={20} className="mx-auto mb-2 text-stone-400" />
                    No detailed info available yet. Check the Calendar tab for availability or leave the first review.
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "photos" && (
              <motion.div
                key="photos"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                  <h2 className="text-xl font-semibold tracking-tight">Photos</h2>
                  <span className="text-xs text-stone-500">
                    {photos.length} {photos.length === 1 ? "photo" : "photos"} from {operatorName}
                  </span>
                </div>
                <PhotoGallery photos={photos} alt={`Site ${site.name} at ${parkName}`} />
              </motion.div>
            )}

            {activeTab === "calendar" && (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                  <h2 className="text-xl font-semibold tracking-tight">Availability</h2>
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
                    {months.map((m) => (
                      <div key={m.key} className="card p-4">
                        <div className="text-sm font-semibold text-stone-900 mb-2">{m.label}</div>
                        <div className="grid grid-cols-7 gap-1 text-[10px]">
                          {m.nights.map((n) => {
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
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "reviews" && (
              <motion.div
                key="reviews"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                  <h2 className="text-xl font-semibold tracking-tight">Reviews</h2>
                  {reviewAggregate.review_count > 0 && (
                    <span className="text-xs text-stone-500">
                      {reviewAggregate.review_count} {reviewAggregate.review_count === 1 ? "review" : "reviews"}
                    </span>
                  )}
                </div>
                <SiteReviewAggregateDisplay aggregate={reviewAggregate} />
                <SiteReviewList reviews={reviews} />
                <SiteReviewForm siteId={site.id} />
              </motion.div>
            )}
          </AnimatePresence>
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
              <dt className="text-stone-500">Park</dt>
              <dd>
                <Link href={`/park/${parkSlug}`} className="text-stone-900 hover:text-forest-700">
                  {parkName}
                </Link>
              </dd>
              <dt className="text-stone-500">Operator</dt>
              <dd>
                <Link href={`/operator/${operatorId}`} className="text-stone-900 hover:text-forest-700">
                  {operatorName}
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
              Book on {operatorName} <ArrowUpRight size={14} />
            </a>
          </div>

          {(bookingRate !== null || reviewAggregate.review_count > 0) && (
            <div className="card p-5">
              <div className="text-xs text-stone-500 uppercase tracking-wide">Site stats</div>
              <dl className="mt-3 space-y-3 text-sm">
                {bookingRate !== null && (
                  <div>
                    <dt className="text-stone-500 flex items-center gap-1.5">
                      <Flame size={12} className="text-orange-500" /> Popularity
                    </dt>
                    <dd className="mt-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500"
                            style={{ width: `${Math.round(bookingRate * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-stone-700">
                          {Math.round(bookingRate * 100)}%
                        </span>
                      </div>
                      <span className="text-xs text-stone-500">
                        {reservedNights} of {bookableNights} bookable nights reserved
                      </span>
                    </dd>
                  </div>
                )}
                {reviewAggregate.review_count > 0 && (
                  <div>
                    <dt className="text-stone-500 flex items-center gap-1.5">
                      <Star size={12} className="text-amber-500" /> Rating
                    </dt>
                    <dd className="mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star
                            key={i}
                            size={12}
                            className={
                              reviewAggregate.rating_avg && i <= Math.round(reviewAggregate.rating_avg)
                                ? "fill-amber-400 text-amber-400"
                                : "text-stone-300"
                            }
                          />
                        ))}
                      </span>
                      <span className="text-xs font-medium text-stone-700 tabular-nums">
                        {reviewAggregate.rating_avg?.toFixed(1)}
                      </span>
                      <span className="text-xs text-stone-500 tabular-nums">
                        ({reviewAggregate.review_count} {reviewAggregate.review_count === 1 ? "review" : "reviews"})
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

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
                {operatorName} validates equipment at the booking step. Filter by yours in the search to see only compatible sites.
              </p>
            </div>
          )}

          {lastChecked && (
            <div className="card p-5 text-sm text-stone-600 leading-relaxed">
              <div className="font-semibold text-stone-900 mb-1.5">Freshness</div>
              We last checked {operatorName} {timeAgo(lastChecked)}. Per-night status refreshes every 15 minutes during the day.
            </div>
          )}

          <div className="card p-5 text-sm text-stone-600 leading-relaxed">
            <div className="font-semibold text-stone-900 mb-1.5 inline-flex items-center gap-1.5">
              <Tent size={14} /> Heads up
            </div>
            We don&apos;t handle rates or take bookings. Click through to {operatorName} to complete your reservation.
            Photos and descriptions come straight from {operatorName}&apos;s booking platform.
          </div>
        </aside>
      </div>
    </section>
  );
}
