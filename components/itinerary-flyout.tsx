"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Calendar, ChevronLeft, MapPin, Route, X } from "lucide-react";
import type { SearchResult, SearchResultSegment } from "@/lib/types";

type Props = {
  result: SearchResult | null;
  onClose: () => void;
  onOpenSiteDetails: (siteId: string, bookingUrl?: string) => void;
};

function segmentsFor(result: SearchResult | null): SearchResultSegment[] {
  return result?.stay?.segments ?? (result ? [result] : []);
}

function nightLabel(segment: SearchResultSegment) {
  const nights = segment.availability.nights;
  if (nights.length <= 1) return nights[0] ?? "Available night";
  return `${nights[0]} to ${nights[nights.length - 1]}`;
}

export function ItineraryFlyout({ result, onClose, onOpenSiteDetails }: Props) {
  const segments = segmentsFor(result);
  const isRoute = segments.length > 1;

  return (
    <AnimatePresence>
      {result && isRoute && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Close route details"
            className="absolute inset-0 bg-stone-950/35 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`${result.stay?.label ?? "Route"} itinerary details`}
            className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-stone-50 shadow-2xl ring-1 ring-stone-950/10"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 330, damping: 34 }}
          >
            <header className="shrink-0 border-b border-stone-200 bg-white/95 backdrop-blur">
              <div className="px-4 py-4 sm:px-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-200"
                    aria-label="Back to search results"
                    title="Back to search results"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Route size={13} /> {result.stay?.label ?? "Route"}
                  </span>
                  <span className="text-stone-300">/</span>
                  <span>{result.availability.nights.length} nights</span>
                  {result.stay?.route_distance_km != null && (
                    <>
                      <span className="text-stone-300">/</span>
                      <span>{result.stay.route_distance_km.toFixed(0)} km route fit</span>
                    </>
                  )}
                </div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
                  Sites in this stay
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-stone-600">
                  Review each nightly campsite in order. Open a site for photos, rules, reviews, and the full availability calendar.
                </p>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="space-y-3">
                {segments.map((segment, index) => (
                  <article
                    key={`${segment.site.id}-${segment.availability.nights.join("-")}`}
                    className="overflow-hidden rounded-lg bg-white ring-1 ring-stone-200"
                  >
                    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                      <div className="relative min-h-[6.5rem] overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200">
                        {segment.site.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={segment.site.thumbnail_url}
                            alt={`${segment.park.name} site ${segment.site.name}`}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-forest-700">
                            Site {segment.site.name}
                          </div>
                        )}
                        <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-xs font-semibold text-forest-700 shadow-sm ring-1 ring-stone-200">
                          {index + 1}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                          <span className="inline-flex items-center gap-1 font-semibold text-stone-700">
                            <Calendar size={12} /> {nightLabel(segment)}
                          </span>
                          {segment.park.distance_km != null && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={12} /> {segment.park.distance_km.toFixed(0)} km away
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                          <Link
                            href={`/park/${segment.park.slug}`}
                            className="truncate text-lg font-semibold text-stone-950 hover:text-forest-700"
                            onClick={onClose}
                          >
                            {segment.park.name}
                          </Link>
                          <span className="text-sm text-stone-500">{segment.park.operator}</span>
                        </div>
                        <div className="mt-0.5 text-sm text-stone-600">
                          {segment.campground.name} / Site {segment.site.name}
                          {segment.site.site_type_label ? ` / ${segment.site.site_type_label}` : ""}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenSiteDetails(segment.site.id, segment.booking_url);
                            }}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-forest-700 px-3 text-xs font-semibold text-white transition hover:bg-forest-800"
                          >
                            Site details
                          </button>
                          <a
                            href={segment.booking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-stone-100 px-3 text-xs font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-white"
                          >
                            Book night <ArrowUpRight size={12} />
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
