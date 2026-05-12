"use client";

import { useCallback, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import type { Site, CampMap, EquipmentOption, ParkReview, SiteReviewAggregate, ParkReviewAggregate, OperatorRuleSource } from "@/lib/types";
import { AvailabilityCalendar, type CalendarRow } from "@/components/availability-calendar";
import { CampgroundMap } from "@/components/campground-map";
import { ParkReviewAggregateDisplay, ParkReviewList, ParkReviewForm } from "@/components/reviews";
import { SiteFieldNotes, type SiteStatsEntry } from "@/components/site-field-notes";
import { SiteDetailFlyout, type SiteFlyoutDetails } from "@/components/site-detail-flyout";
import { RulesPanel } from "@/components/rules-panel";
import { timeAgo } from "@/lib/utils";
import { Info, Map as MapIcon, Calendar, Tent, ArrowUpRight, CalendarRange, MessageSquare, TreePine, ShieldCheck } from "lucide-react";

type SiteAvailability = {
  status: "available" | "reserved" | "closed" | "unknown";
  nights_available: number;
  last_checked_at: string | null;
};

export type DateContext =
  | { mode: "today"; date: string }
  | { mode: "range"; from: string; to: string };

type CampMapSummary = CampMap & {
  total_sites: number;
  available_sites: number;
};

type Props = {
  parkName: string;
  parkSlug: string;
  parkDescription: string;
  parkAddress: string;
  operatorName: string;
  operatorId: string;
  operatorVendor: string;
  vendorUrl: string;
  parkLocation: { lat: number; lng: number };
  totalSites: number;
  avgAvailability: number;
  campMapSummaries: CampMapSummary[];
  sites: Site[];
  availabilitySummary: Record<string, SiteAvailability>;
  bookingUrls: Record<string, string>;
  equipmentOptions: EquipmentOption[];
  calendarRows: CalendarRow[];
  calendarLastChecked: string | null;
  vendorSiteIds: Record<string, string>;
  dateContext: DateContext;
  parkReviews: ParkReview[];
  parkReviewAggregate: ParkReviewAggregate;
  recentSiteReviews: Array<import("@/lib/types").SiteReview & { site_name: string }>;
  parkId: string;
  siteStats: SiteStatsEntry[];
  operatorRuleSource: OperatorRuleSource | null;
};

type Tab = "overview" | "sites" | "calendar" | "rules" | "reviews";
type SitesSubTab = "map" | "field-notes";

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function DateBanner({ ctx }: { ctx: DateContext }) {
  if (ctx.mode === "range") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-forest-50 ring-1 ring-forest-200 text-sm text-forest-900">
        <CalendarRange size={14} />
        <span>
          Showing whether each site is open <span className="font-semibold">every night from {formatDate(ctx.from)} → {formatDate(ctx.to)}</span>.
        </span>
      </div>
    );
  }
  // The page resolves ctx.date to the first night with data — operators hold
  // the first ~14 days back so today's row usually doesn't exist. Make the
  // banner say *which* night we're actually rendering.
  const today = new Date().toISOString().slice(0, 10);
  const isToday = ctx.date === today;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-stone-100 ring-1 ring-stone-200 text-sm text-stone-700">
      <CalendarRange size={14} className="text-stone-500" />
      <span>
        {isToday ? (
          <>
            No dates selected — showing <span className="font-semibold">tonight&apos;s</span> status.
          </>
        ) : (
          <>
            Earliest bookable night — showing <span className="font-semibold">{formatDate(ctx.date)}</span>.
          </>
        )}
        {" "}Pick a date range in the Calendar tab or via{" "}
        <Link href="/search" className="text-forest-700 hover:underline">search</Link> to refine.
      </span>
    </div>
  );
}

export function ParkTabs(props: Props) {
  const {
    parkName,
    parkSlug,
    parkDescription,
    operatorName,
    operatorId,
    operatorVendor,
    vendorUrl,
    parkLocation,
    totalSites,
    avgAvailability,
    campMapSummaries,
    sites,
    availabilitySummary,
    bookingUrls,
    equipmentOptions,
    calendarRows,
    calendarLastChecked,
    vendorSiteIds,
    dateContext,
    parkReviews,
    parkReviewAggregate,
    recentSiteReviews,
    parkId,
    siteStats,
    operatorRuleSource,
  } = props;

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [sitesSubTab, setSitesSubTab] = useState<SitesSubTab>("map");
  const [selectedSection, setSelectedSection] = useState<string | undefined>(undefined);
  const [selectedSiteFlyoutId, setSelectedSiteFlyoutId] = useState<string | null>(null);
  const [refreshingAvailability, setRefreshingAvailability] = useState(false);
  const router = useRouter();

  const refreshLiveAvailability = useCallback(async (payload: { siteId?: string; park?: boolean }) => {
    setRefreshingAvailability(true);
    try {
      await fetch("/api/availability/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parkId: payload.park ? parkId : undefined,
          parkSlug: payload.park ? parkSlug : undefined,
          siteId: payload.siteId,
          startDate: dateContext.mode === "range" ? dateContext.from : dateContext.date,
          days: payload.siteId
            ? 30
            : dateContext.mode === "range"
              ? Math.max(1, Math.min(45, Math.ceil((Date.parse(`${dateContext.to}T00:00:00Z`) - Date.parse(`${dateContext.from}T00:00:00Z`)) / 86_400_000)))
              : 14,
        }),
      });
      router.refresh();
    } catch {
      // Freshening availability is opportunistic; stale cached data is still usable.
    } finally {
      setRefreshingAvailability(false);
    }
  }, [dateContext, parkId, parkSlug, router]);

  const openSiteFlyout = useCallback((siteId: string) => {
    setSelectedSiteFlyoutId(siteId);
    void refreshLiveAvailability({ siteId });
  }, [refreshLiveAvailability]);

  const closeSiteFlyout = useCallback(() => {
    setSelectedSiteFlyoutId(null);
  }, []);

  const siteTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sites) {
      const k = s.site_type_label ?? s.site_type;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [sites]);

  function jumpToSection(campMapId: string) {
    setSelectedSection(campMapId);
    setActiveTab("sites");
    setSitesSubTab("map");
    setTimeout(() => {
      const el = document.getElementById("park-tab-content");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  const TABS: Array<{ id: Tab; label: string; icon: typeof Info }> = [
    { id: "overview", label: "Overview", icon: Info },
    { id: "sites", label: "Sites", icon: Tent },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "rules", label: "Rules", icon: ShieldCheck },
    { id: "reviews", label: "Reviews", icon: MessageSquare },
  ];

  const SITES_SUBTABS: Array<{ id: SitesSubTab; label: string; icon: typeof MapIcon }> = [
    { id: "map", label: "Map", icon: MapIcon },
    { id: "field-notes", label: "Field Notes", icon: TreePine },
  ];

  const availableNowCount = useMemo(
    () => Object.values(availabilitySummary).filter((a) => a.status === "available").length,
    [availabilitySummary],
  );

  const selectedSiteDetails: SiteFlyoutDetails | null = useMemo(() => {
    if (!selectedSiteFlyoutId) return null;
    const site = sites.find((s) => s.id === selectedSiteFlyoutId);
    if (!site) return null;
    return {
      site,
      parkName,
      parkSlug,
      operatorName,
      bookingUrl: bookingUrls[site.id],
      calendarRow: calendarRows.find((row) => row.site.id === site.id) ?? null,
      lastCheckedAt: availabilitySummary[site.id]?.last_checked_at ?? calendarLastChecked,
      stats: siteStats.find((entry) => entry.id === site.id) ?? null,
      recentReviews: recentSiteReviews.filter((review) => review.site_id === site.id),
    };
  }, [
    selectedSiteFlyoutId,
    sites,
    parkName,
    parkSlug,
    operatorName,
    bookingUrls,
    calendarRows,
    availabilitySummary,
    calendarLastChecked,
    siteStats,
    recentSiteReviews,
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <DateBanner ctx={dateContext} />
      {refreshingAvailability && (
        <div className="mt-2 text-xs font-medium text-forest-700" aria-live="polite">
          Refreshing live availability…
        </div>
      )}

      {/* Sticky-ish tab strip */}
      <div className="mt-4 border-b border-stone-200 flex items-end gap-1 overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
                onClick={() => setActiveTab(t.id)}
                onMouseDown={() => {
                  if (t.id === "calendar" || t.id === "sites") void refreshLiveAvailability({ park: true });
                }}
                className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "text-forest-700" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <t.icon size={14} />
              {t.label}
              {active && (
                <motion.span
                  layoutId="park-tab-underline"
                  className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-forest-600"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div id="park-tab-content" className="mt-6 grid lg:grid-cols-3 gap-6 lg:gap-8">
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
                <div>
                  <h2 className="text-xl font-semibold tracking-tight mb-2">About {parkName}</h2>
                  <p className="text-stone-700 leading-relaxed">{parkDescription}</p>
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">Campgrounds</h2>
                    <span className="text-xs text-stone-500">
                      {campMapSummaries.length} {campMapSummaries.length === 1 ? "section" : "sections"} · click any card to open in the Sites tab
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {campMapSummaries.map((m) => {
                      const pct = m.total_sites > 0 ? Math.round((m.available_sites / m.total_sites) * 100) : 0;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => jumpToSection(m.id)}
                          className="card group overflow-hidden text-left transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:ring-stone-300"
                        >
                          <div className="relative h-28 bg-stone-200 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.image_url}
                              alt={m.name ?? "Campground section"}
                              className="absolute inset-0 h-full w-full object-cover opacity-90 group-hover:scale-[1.03] transition-transform duration-500"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                            <span
                              className={`absolute top-2 right-2 chip ring-1 ${
                                pct > 50
                                  ? "bg-emerald-50/95 text-emerald-700 ring-emerald-200"
                                  : pct > 10
                                  ? "bg-amber-50/95 text-amber-700 ring-amber-200"
                                  : "bg-red-50/95 text-red-700 ring-red-200"
                              }`}
                            >
                              {pct}% open
                            </span>
                          </div>
                          <div className="p-4">
                            <div className="font-semibold text-stone-900 group-hover:text-forest-700 transition-colors">
                              {m.name ?? `Section ${m.vendor_map_id}`}
                            </div>
                            {m.description && (
                              <div className="text-xs text-stone-500 mt-0.5 line-clamp-2">{m.description}</div>
                            )}
                            <div className="mt-3 flex items-center justify-between text-xs text-stone-600">
                              <span className="inline-flex items-center gap-1">
                                <Tent size={11} /> {m.total_sites} sites
                              </span>
                              <span className="text-forest-700 group-hover:text-forest-800 font-medium">
                                View map →
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "sites" && (
              <motion.div
                key="sites"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-1 p-1 rounded-lg bg-stone-100 ring-1 ring-stone-200 mb-4 w-fit">
                  {SITES_SUBTABS.map((st) => {
                    const active = sitesSubTab === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSitesSubTab(st.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                          active
                            ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200"
                            : "text-stone-600 hover:text-stone-900"
                        }`}
                      >
                        <st.icon size={12} />
                        {st.label}
                      </button>
                    );
                  })}
                </div>

                {sitesSubTab === "map" && (
                  <>
                    {campMapSummaries.length === 0 ? (
                      <div className="card p-8 text-center text-stone-500">
                        No campground layouts available for this park yet.
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                          <h2 className="text-xl font-semibold tracking-tight">Campground layout</h2>
                          <span className="text-xs text-stone-500">
                            Click any site for details · open in {operatorName} to book
                          </span>
                        </div>
                        <CampgroundMap
                          campMaps={campMapSummaries}
                          sites={sites}
                          availabilitySummary={availabilitySummary}
                          bookingUrls={bookingUrls}
                          operatorName={operatorName}
                          equipmentOptions={equipmentOptions}
                          parkSlug={parkSlug}
                          initialMapId={selectedSection}
                          onOpenSiteDetails={openSiteFlyout}
                        />
                      </>
                    )}
                  </>
                )}

                {sitesSubTab === "field-notes" && (
                  <>
                    <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">Field Notes</h2>
                      <span className="text-xs text-stone-500">
                        Stats, ratings, and popularity rankings for this park&apos;s campsites
                      </span>
                    </div>
                    <SiteFieldNotes
                      parkSlug={parkSlug}
                      totalSites={totalSites}
                      availableCount={availableNowCount}
                      siteStats={siteStats}
                      recentSiteReviews={recentSiteReviews}
                      vendorSiteIds={vendorSiteIds}
                      onOpenSiteDetails={openSiteFlyout}
                    />
                  </>
                )}
              </motion.div>
            )}

            {activeTab === "calendar" && (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                  <h2 className="text-xl font-semibold tracking-tight">Availability calendar</h2>
                  <span className="text-xs text-stone-500">
                    Real per-night status from {operatorName} · click a green cell to book
                  </span>
                </div>
                <AvailabilityCalendar
                  rows={calendarRows}
                  totalSites={sites.length}
                  lastCheckedAt={calendarLastChecked}
                  vendorSiteIds={vendorSiteIds}
                  vendorUrl={vendorUrl}
                  onOpenSiteDetails={openSiteFlyout}
                />
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
                  {parkReviewAggregate.review_count > 0 && (
                    <span className="text-xs text-stone-500">
                      {parkReviewAggregate.review_count} park {parkReviewAggregate.review_count === 1 ? "review" : "reviews"}
                    </span>
                  )}
                </div>

                <ParkReviewAggregateDisplay aggregate={parkReviewAggregate} />
                <ParkReviewList reviews={parkReviews} siteReviews={recentSiteReviews} />
                <ParkReviewForm parkId={parkId} />
              </motion.div>
            )}

            {activeTab === "rules" && (
              <motion.div
                key="rules"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
                <RulesPanel
                  parkName={parkName}
                  operatorName={operatorName}
                  operatorRuleSource={operatorRuleSource}
                  sites={sites}
                  totalSites={totalSites}
                  vendorUrl={vendorUrl}
                  lastCheckedAt={calendarLastChecked}
                  onOpenSiteDetails={openSiteFlyout}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-stone-500 uppercase tracking-wide">At a glance</div>
            <dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-stone-500">Operator</dt>
              <dd>
                <Link href={`/operator/${operatorId}`} className="text-stone-900 hover:text-forest-700">
                  {operatorName}
                </Link>
              </dd>
              <dt className="text-stone-500">Vendor</dt>
              <dd className="text-stone-700">{operatorVendor}</dd>
              <dt className="text-stone-500">Sites</dt>
              <dd className="font-medium tabular-nums">{totalSites.toLocaleString()}</dd>
              <dt className="text-stone-500">Sections</dt>
              <dd className="font-medium tabular-nums">{campMapSummaries.length}</dd>
              <dt className="text-stone-500">Avg open</dt>
              <dd className="font-medium tabular-nums">{avgAvailability}%</dd>
              <dt className="text-stone-500">Coordinates</dt>
              <dd className="text-stone-700">
                {parkLocation.lat.toFixed(3)}, {parkLocation.lng.toFixed(3)}
              </dd>
            </dl>
            <a
              href={vendorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-5 w-full justify-center"
            >
              Book on {operatorName} <ArrowUpRight size={14} />
            </a>
            <Link
              href={`/search?lat=${parkLocation.lat}&lng=${parkLocation.lng}&radius_km=40&operators=${operatorId}`}
              className="btn-secondary mt-2 w-full justify-center"
            >
              Search sites nearby
            </Link>
          </div>

          {equipmentOptions.length > 0 && (
            <div className="card p-5">
              <div className="text-xs text-stone-500 uppercase tracking-wide">Equipment allowed</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {equipmentOptions.map((e) => (
                  <span key={e.sub_equipment_category_id} className="chip bg-stone-100 text-stone-700">
                    {e.name}
                  </span>
                ))}
              </div>
              <p className="text-xs text-stone-500 mt-3 leading-relaxed">
                {operatorName} matches each equipment type against the site at booking. Filter by yours to see only compatible sites.
              </p>
            </div>
          )}

          {siteTypeCounts.length > 0 && (
            <div className="card p-5">
              <div className="text-xs text-stone-500 uppercase tracking-wide">Site types</div>
              <ul className="mt-3 text-sm space-y-1.5">
                {siteTypeCounts.map(([label, n]) => (
                  <li key={label} className="flex items-baseline justify-between gap-3">
                    <span className="text-stone-700">{label}</span>
                    <span className="font-medium text-stone-900 tabular-nums">{n.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {calendarLastChecked && (
            <div className="card p-5 text-sm text-stone-600 leading-relaxed">
              <div className="font-semibold text-stone-900 mb-1.5">Freshness</div>
              We last checked {operatorName} {timeAgo(calendarLastChecked)}. Per-night status refreshes every 15 minutes during the day.
            </div>
          )}
        </aside>
      </div>

      <SiteDetailFlyout details={selectedSiteDetails} onClose={closeSiteFlyout} />
    </section>
  );
}
