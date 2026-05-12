"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  Accessibility,
  ArrowUpRight,
  Calendar,
  Camera,
  ChevronLeft,
  Droplet,
  Flame,
  MessageSquare,
  PawPrint,
  ShieldCheck,
  Star,
  Tent,
  TreePine,
  Users,
  Waves,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Site, SiteReview } from "@/lib/types";
import type { CalendarRow } from "@/components/availability-calendar";
import type { SiteStatsEntry } from "@/components/site-field-notes";
import { PhotoGallery } from "@/components/photo-gallery";
import { SiteRulesCard } from "@/components/rules-panel";
import { timeAgo } from "@/lib/utils";

type Status = "available" | "reserved" | "closed" | "unknown";
type Tab = "photos" | "availability" | "field-notes" | "rules" | "reviews";

export type SiteFlyoutDetails = {
  site: Site;
  parkName: string;
  parkSlug: string;
  operatorName: string;
  bookingUrl?: string;
  calendarRow?: CalendarRow | null;
  lastCheckedAt: string | null;
  stats?: SiteStatsEntry | null;
  recentReviews: Array<SiteReview & { site_name?: string }>;
};

type Props = {
  details: SiteFlyoutDetails | null;
  onClose: () => void;
};

const STATUS_BADGE: Record<Status, { cls: string; label: string }> = {
  available: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Available" },
  reserved: { cls: "bg-red-50 text-red-700 ring-red-200", label: "Reserved" },
  closed: { cls: "bg-red-100 text-red-900 ring-red-300", label: "Closed" },
  unknown: { cls: "bg-stone-100 text-stone-600 ring-stone-200", label: "Unknown" },
};

function groupMonths(row?: CalendarRow | null) {
  if (!row) return [];
  const grouped = new Map<string, Array<{ night_date: string; status: Status }>>();
  for (const [night_date, status] of Object.entries(row.nights).sort(([a], [b]) => a.localeCompare(b))) {
    const key = night_date.slice(0, 7);
    let nights = grouped.get(key);
    if (!nights) {
      nights = [];
      grouped.set(key, nights);
    }
    nights.push({ night_date, status });
  }
  return Array.from(grouped.entries()).slice(0, 4).map(([key, nights]) => ({
    key,
    label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-CA", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    nights,
  }));
}

function bookingUrlForNight(baseUrl: string | undefined, night: string) {
  if (!baseUrl) return null;
  const sep = baseUrl.includes("?") ? "&" : "?";
  const end = new Date(`${night}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return `${baseUrl}${sep}startDate=${night}&endDate=${end.toISOString().slice(0, 10)}`;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={13}
          className={i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-stone-300"}
        />
      ))}
    </span>
  );
}

function FeatureChip({
  children,
  tone = "stone",
}: {
  children: ReactNode;
  tone?: "stone" | "amber" | "lake";
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : tone === "lake"
      ? "bg-lake-50 text-lake-800 ring-lake-200"
      : "bg-stone-100 text-stone-700 ring-stone-200";
  return <span className={`chip ring-1 ${cls}`}>{children}</span>;
}

export function SiteDetailFlyout({ details, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("photos");

  useEffect(() => {
    if (details) setActiveTab("photos");
  }, [details?.site.id]);

  useEffect(() => {
    if (!details) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [details, onClose]);

  const months = useMemo(() => groupMonths(details?.calendarRow), [details?.calendarRow]);
  const openNights = useMemo(() => {
    if (!details?.calendarRow) return 0;
    return Object.values(details.calendarRow.nights).filter((s) => s === "available").length;
  }, [details?.calendarRow]);

  const tabs: Array<{ id: Tab; label: string; icon: LucideIcon; count?: number }> = [
    { id: "photos", label: "Photos", icon: Camera, count: details?.site.photos?.filter((p) => p.url || p.avifUrl).length ?? 0 },
    { id: "availability", label: "Availability", icon: Calendar, count: openNights },
    { id: "field-notes", label: "Field Notes", icon: TreePine },
    { id: "rules", label: "Rules", icon: ShieldCheck, count: details?.site.rule_summary?.highlights?.length ?? 0 },
    { id: "reviews", label: "Reviews", icon: MessageSquare, count: details?.stats?.reviewCount ?? details?.recentReviews.length ?? 0 },
  ];

  return (
    <AnimatePresence>
      {details && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Close site details"
            className="absolute inset-0 bg-stone-950/35 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`Site ${details.site.name} details`}
            className="absolute inset-y-0 right-0 flex w-full max-w-[680px] flex-col bg-stone-50 shadow-2xl ring-1 ring-stone-950/10"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 330, damping: 34 }}
          >
            <header className="shrink-0 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-200"
                  aria-label="Back to map"
                  title="Back to map"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-stone-500">
                    {details.parkName} / {details.operatorName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <h2 className="truncate text-2xl font-semibold text-stone-950">Site {details.site.name}</h2>
                    {details.stats?.ratingAvg && (
                      <span className="chip shrink-0 bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                        <Star size={11} className="fill-amber-400 text-amber-400" />
                        {details.stats.ratingAvg.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                    <span>{details.site.site_type_label ?? details.site.site_type}</span>
                    <span>/</span>
                    <span>Up to {details.site.max_party_size} people</span>
                    {details.lastCheckedAt && (
                      <>
                        <span>/</span>
                        <span>Checked {timeAgo(details.lastCheckedAt)}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
                {tabs.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                        active
                          ? "bg-forest-700 text-white"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-950"
                      }`}
                    >
                      <tab.icon size={14} />
                      {tab.label}
                      {tab.count !== undefined && tab.count > 0 && (
                        <span className={active ? "text-white/75" : "text-stone-400"}>{tab.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
              <AnimatePresence mode="wait">
                {activeTab === "photos" && (
                  <motion.div
                    key="photos"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-5"
                  >
                    <PhotoGallery photos={details.site.photos ?? []} alt={`Site ${details.site.name} at ${details.parkName}`} />
                    {details.site.description && (
                      <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                        <h3 className="text-sm font-semibold text-stone-950">Operator Notes</h3>
                        <p className="mt-2 text-sm leading-relaxed text-stone-700">{details.site.description}</p>
                      </section>
                    )}
                    <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                      <h3 className="text-sm font-semibold text-stone-950">Site Features</h3>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {details.site.has_electric && (
                          <FeatureChip tone="amber"><Zap size={11} /> Electric</FeatureChip>
                        )}
                        {details.site.has_water && (
                          <FeatureChip tone="lake"><Droplet size={11} /> Water</FeatureChip>
                        )}
                        {details.site.is_waterfront && (
                          <FeatureChip tone="lake"><Waves size={11} /> Waterfront</FeatureChip>
                        )}
                        {details.site.is_pull_through && <FeatureChip>Pull-through</FeatureChip>}
                        {details.site.is_accessible && (
                          <FeatureChip><Accessibility size={11} /> Accessible</FeatureChip>
                        )}
                        {details.site.is_pet_friendly && (
                          <FeatureChip><PawPrint size={11} /> Pet-friendly</FeatureChip>
                        )}
                        {!details.site.has_electric &&
                          !details.site.has_water &&
                          !details.site.is_waterfront &&
                          !details.site.is_pull_through &&
                          !details.site.is_accessible &&
                          !details.site.is_pet_friendly && (
                            <span className="text-sm text-stone-500">No extra features listed.</span>
                          )}
                      </div>
                    </section>
                  </motion.div>
                )}

                {activeTab === "availability" && (
                  <motion.div
                    key="availability"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                        <div className="text-xs font-medium uppercase text-stone-500">Open nights</div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{openNights}</div>
                      </div>
                      <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                        <div className="text-xs font-medium uppercase text-stone-500">Bookable window</div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums text-stone-950">
                          {details.calendarRow ? Object.keys(details.calendarRow.nights).length : 0}
                        </div>
                      </div>
                    </div>

                    {months.length === 0 ? (
                      <div className="rounded-lg bg-white p-8 text-center text-sm text-stone-500 ring-1 ring-stone-200">
                        No per-night availability has been collected for this site yet.
                      </div>
                    ) : (
                      months.map((month) => (
                        <section key={month.key} className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-stone-950">{month.label}</h3>
                            <span className="text-xs text-stone-500">
                              {month.nights.filter((n) => n.status === "available").length} open
                            </span>
                          </div>
                          <div className="grid grid-cols-7 gap-1 text-[10px]">
                            {month.nights.map((night) => {
                              const status = STATUS_BADGE[night.status] ?? STATUS_BADGE.unknown;
                              const day = Number(night.night_date.slice(-2));
                              const cell = (
                                <span
                                  className={`flex aspect-square items-center justify-center rounded ring-1 font-medium tabular-nums ${status.cls}`}
                                  title={`${night.night_date} / ${status.label}`}
                                >
                                  {day}
                                </span>
                              );
                              const url = night.status === "available" ? bookingUrlForNight(details.bookingUrl, night.night_date) : null;
                              return url ? (
                                <a
                                  key={night.night_date}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block transition-transform hover:scale-105"
                                  aria-label={`Book site ${details.site.name} on ${night.night_date}`}
                                >
                                  {cell}
                                </a>
                              ) : (
                                <span key={night.night_date}>{cell}</span>
                              );
                            })}
                          </div>
                        </section>
                      ))
                    )}
                  </motion.div>
                )}

                {activeTab === "field-notes" && (
                  <motion.div
                    key="field-notes"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-4"
                  >
                    <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                      <h3 className="text-sm font-semibold text-stone-950">Campsite Snapshot</h3>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-stone-500">Type</dt>
                          <dd className="mt-0.5 font-medium text-stone-950">{details.site.site_type_label ?? details.site.site_type}</dd>
                        </div>
                        <div>
                          <dt className="text-stone-500">Party size</dt>
                          <dd className="mt-0.5 inline-flex items-center gap-1 font-medium text-stone-950">
                            <Users size={12} /> {details.site.max_party_size}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-stone-500">Equipment length</dt>
                          <dd className="mt-0.5 font-medium text-stone-950">
                            {details.site.max_equipment_length_ft ? `${details.site.max_equipment_length_ft} ft` : "Not listed"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-stone-500">Map position</dt>
                          <dd className="mt-0.5 font-medium text-stone-950">
                            {details.site.map_x != null && details.site.map_y != null ? `${Math.round(details.site.map_x)}, ${Math.round(details.site.map_y)}` : "Not mapped"}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    {details.stats && (
                      <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                        <h3 className="text-sm font-semibold text-stone-950">Booking Pattern</h3>
                        <div className="mt-4 space-y-4">
                          <div>
                            <div className="flex items-center justify-between text-xs text-stone-500">
                              <span className="inline-flex items-center gap-1"><Flame size={12} className="text-orange-500" /> Reserved share</span>
                              <span className="font-semibold tabular-nums text-stone-800">
                                {details.stats.availableNights + details.stats.reservedNights > 0
                                  ? `${Math.round((details.stats.reservedNights / (details.stats.availableNights + details.stats.reservedNights)) * 100)}%`
                                  : "0%"}
                              </span>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500"
                                style={{
                                  width: `${
                                    details.stats.availableNights + details.stats.reservedNights > 0
                                      ? Math.round((details.stats.reservedNights / (details.stats.availableNights + details.stats.reservedNights)) * 100)
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                            <div className="mt-1 text-xs text-stone-500">
                              {details.stats.reservedNights} of {details.stats.availableNights + details.stats.reservedNights} bookable nights reserved.
                            </div>
                          </div>

                          {details.stats.ratingAvg && (
                            <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-stone-200">
                              <span className="text-sm font-medium text-stone-800">Camper rating</span>
                              <span className="inline-flex items-center gap-2">
                                <StarRating rating={details.stats.ratingAvg} />
                                <span className="text-xs text-stone-500 tabular-nums">({details.stats.reviewCount})</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </motion.div>
                )}

                {activeTab === "reviews" && (
                  <motion.div
                    key="reviews"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-3"
                  >
                    {details.recentReviews.length === 0 ? (
                      <div className="rounded-lg bg-white p-8 text-center text-sm text-stone-500 ring-1 ring-stone-200">
                        No recent camper notes for this site yet.
                      </div>
                    ) : (
                      details.recentReviews.map((review) => (
                        <article key={review.id} className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                          <div className="flex items-center justify-between gap-3">
                            <StarRating rating={review.overall} />
                            <span className="text-xs text-stone-500">{review.created_at ? timeAgo(review.created_at) : null}</span>
                          </div>
                          {review.title && (
                            <h3 className="mt-2 text-sm font-semibold text-stone-950">{review.title}</h3>
                          )}
                          {review.body && (
                            <p className="mt-1 text-sm leading-relaxed text-stone-700">{review.body}</p>
                          )}
                        </article>
                      ))
                    )}
                  </motion.div>
                )}

                {activeTab === "rules" && (
                  <motion.div
                    key="rules"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-4"
                  >
                    <SiteRulesCard site={details.site} operatorName={details.operatorName} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <footer className="shrink-0 border-t border-stone-200 bg-white px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                {details.bookingUrl && (
                  <a
                    href={details.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary flex-1 justify-center"
                  >
                    Book on {details.operatorName} <ArrowUpRight size={14} />
                  </a>
                )}
                <Link
                  href={`/park/${details.parkSlug}/site/${details.site.vendor_site_id}`}
                  className="btn-secondary flex-1 justify-center"
                >
                  Full page
                </Link>
              </div>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
