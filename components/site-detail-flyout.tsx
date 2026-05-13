"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronLeft, X } from "lucide-react";
import type { EquipmentOption, Site, SiteReview, SiteReviewAggregate } from "@/lib/types";
import type { CalendarRow } from "@/components/availability-calendar";
import type { SiteStatsEntry } from "@/components/site-field-notes";
import { SiteTabs } from "@/components/site-tabs";
import { displayOperatorName } from "@/lib/display";
import { timeAgo } from "@/lib/utils";

type MonthCalendar = {
  key: string;
  label: string;
  nights: Array<{ night_date: string; status: string }>;
};

type ReviewPayload = {
  siteId: string;
  reviews: SiteReview[];
  aggregate: SiteReviewAggregate;
};

export type SiteFlyoutDetails = {
  site: Site;
  parkName: string;
  parkSlug: string;
  operatorName: string;
  operatorId: string;
  bookingUrl?: string;
  equipment: EquipmentOption[];
  calendarRow?: CalendarRow | null;
  lastCheckedAt: string | null;
  stats?: SiteStatsEntry | null;
  recentReviews: Array<SiteReview & { site_name?: string }>;
};

type Props = {
  details: SiteFlyoutDetails | null;
  onClose: () => void;
  checkingLive?: boolean;
};

const EMPTY_REVIEW_AGGREGATE: SiteReviewAggregate = {
  review_count: 0,
  rating_avg: null,
  rating_privacy: null,
  rating_cleanliness: null,
  rating_noise: null,
  rating_site_size: null,
  rating_shade: null,
  rating_cell_service: null,
};

function groupMonths(row?: CalendarRow | null): MonthCalendar[] {
  if (!row) return [];
  const grouped = new Map<string, Array<{ night_date: string; status: string }>>();
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

function fallbackAggregate(stats?: SiteStatsEntry | null): SiteReviewAggregate {
  if (!stats || stats.reviewCount === 0) return EMPTY_REVIEW_AGGREGATE;
  return {
    ...EMPTY_REVIEW_AGGREGATE,
    review_count: stats.reviewCount,
    rating_avg: stats.ratingAvg,
  };
}

export function SiteDetailFlyout({ details, onClose, checkingLive = false }: Props) {
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(null);

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

  useEffect(() => {
    if (!details) {
      setReviewPayload(null);
      return;
    }
    const ac = new AbortController();
    setReviewPayload(null);
    fetch(`/api/reviews/site?site_id=${encodeURIComponent(details.site.id)}&limit=50`, {
      signal: ac.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load reviews"))))
      .then((payload: Omit<ReviewPayload, "siteId">) => {
        setReviewPayload({ siteId: details.site.id, ...payload });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setReviewPayload(null);
      });
    return () => ac.abort();
  }, [details?.site.id]);

  const months = useMemo(() => groupMonths(details?.calendarRow), [details?.calendarRow]);
  const openNights = useMemo(() => {
    if (!details?.calendarRow) return 0;
    return Object.values(details.calendarRow.nights).filter((status) => status === "available").length;
  }, [details?.calendarRow]);

  const bookableNights = (details?.stats?.availableNights ?? 0) + (details?.stats?.reservedNights ?? 0);
  const reservedNights = details?.stats?.reservedNights ?? 0;
  const bookingRate = bookableNights > 0 ? reservedNights / bookableNights : null;
  const activeReviewPayload = reviewPayload?.siteId === details?.site.id ? reviewPayload : null;
  const reviewAggregate = activeReviewPayload?.aggregate ?? fallbackAggregate(details?.stats);
  const reviews = activeReviewPayload?.reviews ?? details?.recentReviews ?? [];
  const operatorName = displayOperatorName(details?.operatorName);

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
            className="absolute inset-y-0 right-0 flex w-full max-w-[1180px] flex-col bg-stone-50 shadow-2xl ring-1 ring-stone-950/10"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 330, damping: 34 }}
          >
            <header className="shrink-0 border-b border-stone-200 bg-white/95 backdrop-blur">
              <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
                <div className="mb-3 flex items-center gap-1.5 text-xs text-stone-500">
	                  <Link href={`/operator/${details.operatorId}`} className="hover:text-stone-900">
	                    {operatorName}
	                  </Link>
                  <span>/</span>
                  <Link href={`/park/${details.parkSlug}`} className="hover:text-stone-900">
                    {details.parkName}
                  </Link>
                  <span>/</span>
                  <span className="text-stone-700">Site {details.site.name}</span>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-200"
                      aria-label="Back to park map"
                      title="Back to park map"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div className="min-w-0">
                      <h2 className="truncate text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
                        Site {details.site.name}
                      </h2>
                      <div className="mt-1 text-sm text-stone-600">
                        {details.site.site_type_label ?? details.site.site_type.toUpperCase()} /
                        <Link href={`/park/${details.parkSlug}`} className="ml-1 text-stone-700 hover:text-stone-900">
                          {details.parkName}
                        </Link>
                        {details.lastCheckedAt && <> / checked {timeAgo(details.lastCheckedAt)}</>}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {details.bookingUrl && (
                      checkingLive ? (
                        <button type="button" disabled className="btn-primary hidden cursor-not-allowed opacity-60 sm:inline-flex">
                          Checking live status
                        </button>
                      ) : (
                        <a
                          href={details.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary hidden sm:inline-flex"
                        >
	                          Book on {operatorName} <ArrowUpRight size={14} />
                        </a>
                      )
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                      aria-label="Close"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <SiteTabs
                site={details.site}
                parkName={details.parkName}
                parkSlug={details.parkSlug}
	                operatorName={operatorName}
                operatorId={details.operatorId}
                bookingUrl={details.bookingUrl ?? ""}
                photos={details.site.photos ?? []}
                months={months}
                openNights={openNights}
                lastChecked={details.lastCheckedAt}
                equipment={details.equipment}
                reviews={reviews}
                reviewAggregate={reviewAggregate}
                bookingRate={bookingRate}
                reservedNights={reservedNights}
                bookableNights={bookableNights}
                checkingLive={checkingLive}
              />
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
