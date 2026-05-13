"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import type { Site, CampMap, EquipmentOption, ParkReview, SiteReviewAggregate, ParkReviewAggregate, OperatorRuleSource } from "@/lib/types";
import { AvailabilityCalendar, type CalendarRow } from "@/components/availability-calendar";
import { CampgroundMap } from "@/components/campground-map";
import { ParkLocationMap } from "@/components/park-location-map";
import { ParkReviewAggregateDisplay, ParkReviewList, ParkReviewForm } from "@/components/reviews";
import { SiteFieldNotes, type SiteStatsEntry } from "@/components/site-field-notes";
import { SiteDetailFlyout, type SiteFlyoutDetails } from "@/components/site-detail-flyout";
import { RulesPanel } from "@/components/rules-panel";
import { WeatherStrip } from "@/components/weather-strip";
import { ParkAlertsStrip } from "@/components/park-alerts-strip";
import { timeAgo } from "@/lib/utils";
import { mapImageUrl } from "@/lib/map-image";
import { imageProxyUrl } from "@/lib/image-proxy";
import { Info, Map as MapIcon, Calendar, Tent, ArrowUpRight, CalendarRange, MessageSquare, TreePine, ShieldCheck, Loader2, X, ChevronDown } from "lucide-react";

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
  availability_pending?: boolean;
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
  calendarDataUrl?: string;
  siteDataUrl?: string;
  reviewDataUrl?: string;
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
type CalendarLoadStatus = "idle" | "loading" | "ready" | "error";

type ParkCalendarPayload = {
  calendarRows: CalendarRow[];
  calendarLastChecked: string | null;
  vendorSiteIds: Record<string, string>;
  bookingUrls: Record<string, string>;
};

type ParkSitePayload = {
  campMapSummaries: CampMapSummary[];
  sites: Site[];
  availabilitySummary: Record<string, SiteAvailability>;
  bookingUrls: Record<string, string>;
  calendarLastChecked: string | null;
  siteStats: SiteStatsEntry[];
};

type ParkReviewPayload = {
  parkReviews: ParkReview[];
  parkReviewAggregate: ParkReviewAggregate;
  recentSiteReviews: Array<import("@/lib/types").SiteReview & { site_name: string }>;
};

const PARK_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const SITE_REFRESH_COOLDOWN_MS = 2 * 60 * 1000;
const availabilityRefreshAttempts = new Map<string, number>();
const availabilityRefreshesInFlight = new Map<string, Promise<void>>();

function wasRecentlyAttempted(key: string, cooldownMs: number): boolean {
  const attemptedAt = availabilityRefreshAttempts.get(key);
  if (!attemptedAt) return false;
  if (Date.now() - attemptedAt < cooldownMs) return true;
  availabilityRefreshAttempts.delete(key);
  return false;
}

function isFreshEnough(iso: string | null | undefined, minutes: number): boolean {
  if (!iso) return false;
  const checkedAt = new Date(iso).getTime();
  if (!Number.isFinite(checkedAt)) return false;
  return Date.now() - checkedAt < minutes * 60 * 1000;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function rangeStatusText(ctx: DateContext): ReactNode {
  if (ctx.mode === "range") {
    return (
      <>
        Showing sites open every night from <span className="font-semibold">{formatDate(ctx.from)} to {formatDate(ctx.to)}</span>.
      </>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  if (ctx.date === today) {
    return (
      <>
        No dates selected - showing <span className="font-semibold">tonight&apos;s</span> status.
      </>
    );
  }

  return (
    <>
      Earliest bookable night - showing <span className="font-semibold">{formatDate(ctx.date)}</span>.
    </>
  );
}

function DateFilter({ ctx }: { ctx: DateContext }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFrom = ctx.mode === "range" ? ctx.from : "";
  const activeTo = ctx.mode === "range" ? ctx.to : "";
  const [fromDate, setFromDate] = useState(activeFrom);
  const [toDate, setToDate] = useState(activeTo);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    setFromDate(activeFrom);
    setToDate(activeTo);
    setRangeError(null);
  }, [activeFrom, activeTo]);

  function pushParams(nextParams: URLSearchParams) {
    const query = nextParams.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function applyRange(event: FormEvent) {
    event.preventDefault();
    const from = fromDate || toDate;
    const to = toDate || fromDate;

    if (!from || !to) {
      setRangeError("Choose at least one night.");
      return;
    }
    if (from > to) {
      setRangeError("Last night must be after first night.");
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("from", from);
    nextParams.set("to", to);
    setRangeError(null);
    pushParams(nextParams);
  }

  function clearRange() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("from");
    nextParams.delete("to");
    setRangeError(null);
    setFromDate("");
    setToDate("");
    pushParams(nextParams);
  }

  const dateControls = (className: string) => (
    <form onSubmit={applyRange} className={className}>
      <label className="flex h-8 min-w-0 items-center gap-2 rounded-md bg-stone-50 px-2.5 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600 md:w-40">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-500 md:text-[11px]">First</span>
        <input
          type="date"
          aria-label="First night"
          className="h-full min-w-0 flex-1 bg-transparent text-xs font-semibold text-stone-950 outline-none"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
        />
      </label>
      <label className="flex h-8 min-w-0 items-center gap-2 rounded-md bg-stone-50 px-2.5 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600 md:w-40">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-500 md:text-[11px]">Last</span>
        <input
          type="date"
          aria-label="Last night"
          className="h-full min-w-0 flex-1 bg-transparent text-xs font-semibold text-stone-950 outline-none"
          min={fromDate || undefined}
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
        />
      </label>
      <button type="submit" className="btn-primary h-8 px-3 text-xs">
        <CalendarRange size={13} />
        Show
      </button>
      <button
        type="button"
        onClick={clearRange}
        disabled={ctx.mode !== "range" && !fromDate && !toDate}
        className="btn-secondary h-8 px-3 text-xs"
      >
        <X size={13} />
        Clear
      </button>
    </form>
  );

  return (
    <div className="rounded-lg bg-white px-2.5 py-1 shadow-sm ring-1 ring-stone-200 md:px-3">
      <div className="flex min-h-8 items-center gap-2 md:justify-between">
        <div className={`flex min-w-0 flex-1 items-center gap-2 text-xs md:text-sm ${ctx.mode === "range" ? "text-forest-900" : "text-stone-700"}`}>
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 md:h-7 md:w-7 ${
            ctx.mode === "range" ? "bg-forest-50 text-forest-700 ring-forest-200" : "bg-stone-100 text-stone-500 ring-stone-200"
          }`}>
            <CalendarRange size={13} />
          </span>
          <span className="min-w-0 truncate">{rangeStatusText(ctx)}</span>
        </div>

        {dateControls("hidden shrink-0 items-center gap-2 md:flex")}

        <button
          type="button"
          onClick={() => setMobileExpanded((expanded) => !expanded)}
          className="btn-secondary h-8 shrink-0 px-2.5 text-xs md:hidden"
          aria-expanded={mobileExpanded}
        >
          Dates
          <ChevronDown size={13} className={`transition-transform ${mobileExpanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {mobileExpanded && dateControls("mt-2 grid grid-cols-2 gap-2 md:hidden")}
      {rangeError && <div className="mt-2 text-xs font-semibold text-amber-700">{rangeError}</div>}
    </div>
  );
}

function siteStatusClasses(status: SiteAvailability["status"]): string {
  if (status === "available") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "reserved") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "closed") return "bg-red-100 text-red-900 ring-red-300";
  return "bg-stone-100 text-stone-600 ring-stone-200";
}

function SiteDirectoryFallback({
  sites,
  availabilitySummary,
  bookingUrls,
  operatorName,
  onOpenSiteDetails,
}: {
  sites: Site[];
  availabilitySummary: Record<string, SiteAvailability>;
  bookingUrls: Record<string, string>;
  operatorName: string;
  onOpenSiteDetails: (siteId: string) => void;
}) {
  const visibleSites = sites.slice(0, 36);
  const availableCount = sites.filter((s) => availabilitySummary[s.id]?.status === "available").length;
  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-stone-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-100 px-4 py-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Sites</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            No operator sitemap is available for this park yet, so the site index is shown here.
          </p>
        </div>
        <span className="text-xs text-stone-500">
          {availableCount.toLocaleString()} open · {sites.length.toLocaleString()} total
        </span>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {visibleSites.map((site) => {
          const status = availabilitySummary[site.id]?.status ?? "unknown";
          const photo = (site.photos ?? []).find((p) => p.url || p.avifUrl);
          const photoUrl = imageProxyUrl(photo?.url ?? photo?.avifUrl, "thumb") ?? photo?.url ?? photo?.avifUrl ?? "";
          return (
            <div key={site.id} className="flex min-w-0 gap-3 rounded-lg bg-stone-50 p-2.5 ring-1 ring-stone-200">
              <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md bg-stone-200">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt={`Site ${site.name}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs font-semibold text-stone-500">
                    {site.name}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-stone-900">Site {site.name}</div>
                    <div className="mt-0.5 truncate text-xs text-stone-500">
                      {site.site_type_label ?? site.site_type.toUpperCase()}
                    </div>
                  </div>
                  <span className={`chip shrink-0 ring-1 ${siteStatusClasses(status)}`}>{status}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {site.has_electric && <span className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-200">Electric</span>}
                  {site.is_waterfront && <span className="chip bg-lake-50 text-lake-800 ring-1 ring-lake-200">Waterfront</span>}
                  {site.is_pet_friendly && <span className="chip bg-stone-100 text-stone-700 ring-1 ring-stone-200">Pets</span>}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onOpenSiteDetails(site.id)}
                    className="font-medium text-forest-700 hover:text-forest-800"
                  >
                    Details
                  </button>
                  <a
                    href={bookingUrls[site.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-stone-600 hover:text-stone-900"
                  >
                    {operatorName} <ArrowUpRight size={10} />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {sites.length > visibleSites.length && (
        <div className="border-t border-stone-100 px-4 py-2 text-xs text-stone-500">
          Showing {visibleSites.length.toLocaleString()} of {sites.length.toLocaleString()} sites. Use Field Notes or Calendar for the full indexed set.
        </div>
      )}
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
    campMapSummaries: initialCampMapSummaries,
    sites: initialSites,
    availabilitySummary: initialAvailabilitySummary,
    bookingUrls: initialBookingUrls,
    equipmentOptions,
    calendarRows,
    calendarLastChecked: initialCalendarLastChecked,
    vendorSiteIds,
    calendarDataUrl,
    siteDataUrl,
    reviewDataUrl,
    dateContext,
    parkReviews: initialParkReviews,
    parkReviewAggregate: initialParkReviewAggregate,
    recentSiteReviews: initialRecentSiteReviews,
    parkId,
    siteStats: initialSiteStats,
    operatorRuleSource,
  } = props;

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [sitesSubTab, setSitesSubTab] = useState<SitesSubTab>("map");
  const [selectedSection, setSelectedSection] = useState<string | undefined>(undefined);
  const [selectedSiteDetails, setSelectedSiteDetails] = useState<SiteFlyoutDetails | null>(null);
  const [parkRefreshKeyInFlight, setParkRefreshKeyInFlight] = useState<string | null>(null);
  const [refreshingSiteId, setRefreshingSiteId] = useState<string | null>(null);
  const [siteData, setSiteData] = useState<ParkSitePayload>({
    campMapSummaries: initialCampMapSummaries,
    sites: initialSites,
    availabilitySummary: initialAvailabilitySummary,
    bookingUrls: initialBookingUrls,
    calendarLastChecked: initialCalendarLastChecked,
    siteStats: initialSiteStats,
  });
  const [siteLoadStatus, setSiteLoadStatus] = useState<CalendarLoadStatus>(
    initialSites.length > 0 ? "ready" : "idle",
  );
  const [reviewData, setReviewData] = useState<ParkReviewPayload>({
    parkReviews: initialParkReviews,
    parkReviewAggregate: initialParkReviewAggregate,
    recentSiteReviews: initialRecentSiteReviews,
  });
  const [reviewLoadStatus, setReviewLoadStatus] = useState<CalendarLoadStatus>(
    initialParkReviews.length > 0 || initialParkReviewAggregate.review_count > 0 ? "ready" : "idle",
  );
  const [calendarData, setCalendarData] = useState<ParkCalendarPayload>({
    calendarRows,
    calendarLastChecked: initialCalendarLastChecked,
    vendorSiteIds,
    bookingUrls: initialBookingUrls,
  });
  const [calendarLoadStatus, setCalendarLoadStatus] = useState<CalendarLoadStatus>(
    calendarRows.length > 0 ? "ready" : "idle",
  );
  const siteDataUrlRef = useRef(siteDataUrl ?? null);
  const siteLoadStatusRef = useRef<CalendarLoadStatus>(initialSites.length > 0 ? "ready" : "idle");
  const reviewDataUrlRef = useRef(reviewDataUrl ?? null);
  const reviewLoadStatusRef = useRef<CalendarLoadStatus>(
    initialParkReviews.length > 0 || initialParkReviewAggregate.review_count > 0 ? "ready" : "idle",
  );
  const calendarDataUrlRef = useRef(calendarDataUrl ?? null);
  const calendarLoadStatusRef = useRef<CalendarLoadStatus>(calendarRows.length > 0 ? "ready" : "idle");
  const router = useRouter();

  const dateWindowKey = useMemo(() => (
    dateContext.mode === "range"
      ? `${dateContext.from}:${dateContext.to}`
      : dateContext.date
  ), [dateContext]);
  const parkRefreshKey = `park:${parkId}:${dateWindowKey}`;
  const parkRefreshInFlight = parkRefreshKeyInFlight === parkRefreshKey;
  const activeCampMapSummaries = siteData.campMapSummaries.length > 0
    ? siteData.campMapSummaries
    : initialCampMapSummaries;
  const activeSites = siteData.sites;
  const activeAvailabilitySummary = siteData.availabilitySummary;
  const activeSiteStats = siteData.siteStats;
  const activeParkReviews = reviewData.parkReviews;
  const activeParkReviewAggregate = reviewData.parkReviewAggregate;
  const activeRecentSiteReviews = reviewData.recentSiteReviews;
  const activeSiteBookingUrls = siteData.bookingUrls;
  const activeTotalSites = activeSites.length > 0 ? activeSites.length : totalSites;
  const activeAvgAvailability =
    activeSites.length > 0 && activeTotalSites > 0
      ? Math.round((Object.values(activeAvailabilitySummary).filter((a) => a.status === "available").length / activeTotalSites) * 100)
      : avgAvailability;
  const activeCalendarRows = calendarData.calendarRows;
  const activeCalendarLastChecked = calendarData.calendarLastChecked ?? siteData.calendarLastChecked ?? initialCalendarLastChecked;
  const activeVendorSiteIds = Object.keys(calendarData.vendorSiteIds).length > 0
    ? calendarData.vendorSiteIds
    : vendorSiteIds;
  const activeBookingUrls = Object.keys(calendarData.bookingUrls).length > 0
    ? calendarData.bookingUrls
    : activeSiteBookingUrls;

  useEffect(() => {
    calendarLoadStatusRef.current = calendarLoadStatus;
  }, [calendarLoadStatus]);

  useEffect(() => {
    siteLoadStatusRef.current = siteLoadStatus;
  }, [siteLoadStatus]);

  useEffect(() => {
    reviewLoadStatusRef.current = reviewLoadStatus;
  }, [reviewLoadStatus]);

  useEffect(() => {
    const nextUrl = siteDataUrl ?? null;
    const urlChanged = siteDataUrlRef.current !== nextUrl;
    if (!urlChanged && initialSites.length === 0) return;
    siteDataUrlRef.current = nextUrl;
    setSiteData({
      campMapSummaries: initialCampMapSummaries,
      sites: initialSites,
      availabilitySummary: initialAvailabilitySummary,
      bookingUrls: initialBookingUrls,
      calendarLastChecked: initialCalendarLastChecked,
      siteStats: initialSiteStats,
    });
    const nextStatus = initialSites.length > 0 ? "ready" : "idle";
    siteLoadStatusRef.current = nextStatus;
    setSiteLoadStatus(nextStatus);
  }, [
    initialAvailabilitySummary,
    initialBookingUrls,
    initialCalendarLastChecked,
    initialCampMapSummaries,
    initialSiteStats,
    initialSites,
    siteDataUrl,
  ]);

  useEffect(() => {
    const nextUrl = reviewDataUrl ?? null;
    const urlChanged = reviewDataUrlRef.current !== nextUrl;
    if (!urlChanged && initialParkReviews.length === 0 && initialParkReviewAggregate.review_count === 0) return;
    reviewDataUrlRef.current = nextUrl;
    setReviewData({
      parkReviews: initialParkReviews,
      parkReviewAggregate: initialParkReviewAggregate,
      recentSiteReviews: initialRecentSiteReviews,
    });
    const nextStatus = initialParkReviews.length > 0 || initialParkReviewAggregate.review_count > 0 ? "ready" : "idle";
    reviewLoadStatusRef.current = nextStatus;
    setReviewLoadStatus(nextStatus);
  }, [
    initialParkReviewAggregate,
    initialParkReviews,
    initialRecentSiteReviews,
    reviewDataUrl,
  ]);

  useEffect(() => {
    const nextUrl = calendarDataUrl ?? null;
    const urlChanged = calendarDataUrlRef.current !== nextUrl;
    if (!urlChanged && calendarRows.length === 0) return;
    calendarDataUrlRef.current = nextUrl;
    setCalendarData({
      calendarRows,
      calendarLastChecked: initialCalendarLastChecked,
      vendorSiteIds,
      bookingUrls: initialBookingUrls,
    });
    const nextStatus = calendarRows.length > 0 ? "ready" : "idle";
    calendarLoadStatusRef.current = nextStatus;
    setCalendarLoadStatus(nextStatus);
  }, [initialBookingUrls, calendarDataUrl, initialCalendarLastChecked, calendarRows, vendorSiteIds]);

  const loadSiteData = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!siteDataUrl) return;
    const currentStatus = siteLoadStatusRef.current;
    if (currentStatus === "loading" || (!force && currentStatus === "ready")) return;
    const keepReadyVisible = currentStatus === "ready";
    siteLoadStatusRef.current = "loading";
    if (!keepReadyVisible) {
      setSiteLoadStatus("loading");
    }
    try {
      const response = await fetch(siteDataUrl);
      if (!response.ok) throw new Error("Unable to load park sites");
      const payload = (await response.json()) as Partial<ParkSitePayload>;
      setSiteData((current) => ({
        campMapSummaries: payload.campMapSummaries ?? current.campMapSummaries,
        sites: payload.sites ?? [],
        availabilitySummary: payload.availabilitySummary ?? {},
        bookingUrls: { ...initialBookingUrls, ...(payload.bookingUrls ?? {}) },
        calendarLastChecked: payload.calendarLastChecked ?? current.calendarLastChecked,
        siteStats: payload.siteStats ?? [],
      }));
      siteLoadStatusRef.current = "ready";
      setSiteLoadStatus("ready");
    } catch {
      if (keepReadyVisible) {
        siteLoadStatusRef.current = "ready";
      } else {
        siteLoadStatusRef.current = "error";
        setSiteLoadStatus("error");
      }
    }
  }, [initialBookingUrls, siteDataUrl]);

  const loadReviewData = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!reviewDataUrl) return;
    const currentStatus = reviewLoadStatusRef.current;
    if (currentStatus === "loading" || (!force && currentStatus === "ready")) return;
    const keepReadyVisible = currentStatus === "ready";
    reviewLoadStatusRef.current = "loading";
    if (!keepReadyVisible) {
      setReviewLoadStatus("loading");
    }
    try {
      const response = await fetch(reviewDataUrl);
      if (!response.ok) throw new Error("Unable to load park reviews");
      const payload = (await response.json()) as Partial<ParkReviewPayload>;
      setReviewData((current) => ({
        parkReviews: payload.parkReviews ?? current.parkReviews,
        parkReviewAggregate: payload.parkReviewAggregate ?? current.parkReviewAggregate,
        recentSiteReviews: payload.recentSiteReviews ?? current.recentSiteReviews,
      }));
      reviewLoadStatusRef.current = "ready";
      setReviewLoadStatus("ready");
    } catch {
      if (keepReadyVisible) {
        reviewLoadStatusRef.current = "ready";
      } else {
        reviewLoadStatusRef.current = "error";
        setReviewLoadStatus("error");
      }
    }
  }, [reviewDataUrl]);

  const loadCalendarData = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (!calendarDataUrl) return;
    const currentStatus = calendarLoadStatusRef.current;
    if (currentStatus === "loading" || (!force && currentStatus === "ready")) return;
    const keepReadyVisible = currentStatus === "ready";
    calendarLoadStatusRef.current = "loading";
    if (!keepReadyVisible) {
      setCalendarLoadStatus("loading");
    }
    try {
      const response = await fetch(calendarDataUrl);
      if (!response.ok) throw new Error("Unable to load park calendar");
      const payload = (await response.json()) as Partial<ParkCalendarPayload>;
      setCalendarData({
        calendarRows: payload.calendarRows ?? [],
        calendarLastChecked: payload.calendarLastChecked ?? null,
        vendorSiteIds: payload.vendorSiteIds ?? {},
        bookingUrls: { ...activeSiteBookingUrls, ...(payload.bookingUrls ?? {}) },
      });
      calendarLoadStatusRef.current = "ready";
      setCalendarLoadStatus("ready");
    } catch {
      if (keepReadyVisible) {
        calendarLoadStatusRef.current = "ready";
      } else {
        calendarLoadStatusRef.current = "error";
        setCalendarLoadStatus("error");
      }
    }
  }, [activeSiteBookingUrls, calendarDataUrl]);

  const refreshLiveAvailability = useCallback(async (payload: { siteId?: string; park?: boolean }) => {
    const scopedSiteId = payload.siteId ?? null;
    const refreshKey = scopedSiteId ? `site:${parkId}:${scopedSiteId}:${dateWindowKey}` : parkRefreshKey;
    const cooldownMs = scopedSiteId ? SITE_REFRESH_COOLDOWN_MS : PARK_REFRESH_COOLDOWN_MS;
    const lastCheckedAt = scopedSiteId
      ? activeAvailabilitySummary[scopedSiteId]?.last_checked_at
      : activeCalendarLastChecked;

    if (isFreshEnough(lastCheckedAt, scopedSiteId ? 2 : 3)) return;

    const pending = availabilityRefreshesInFlight.get(refreshKey);
    if (pending) {
      await pending;
      return;
    }
    if (wasRecentlyAttempted(refreshKey, cooldownMs)) return;

    availabilityRefreshAttempts.set(refreshKey, Date.now());
    if (scopedSiteId) {
      setRefreshingSiteId(scopedSiteId);
    } else {
      setParkRefreshKeyInFlight(refreshKey);
    }

    const refreshPromise = (async () => {
      const response = await fetch("/api/availability/refresh", {
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
              ? Math.max(1, Math.min(45, Math.ceil((Date.parse(`${dateContext.to}T00:00:00Z`) - Date.parse(`${dateContext.from}T00:00:00Z`)) / 86_400_000) + 1))
              : 14,
        }),
      });
      if (response.ok) {
        if (!scopedSiteId) {
          void loadCalendarData({ force: true });
        }
        router.refresh();
      }
    })()
      .catch(() => {
        // Freshening availability is opportunistic; stale cached data is still usable.
      })
      .finally(() => {
        availabilityRefreshesInFlight.delete(refreshKey);
        if (scopedSiteId) {
          setRefreshingSiteId((current) => (current === scopedSiteId ? null : current));
        } else {
          setParkRefreshKeyInFlight((current) => (current === refreshKey ? null : current));
        }
      });

    availabilityRefreshesInFlight.set(refreshKey, refreshPromise);
    await refreshPromise;
  }, [activeAvailabilitySummary, activeCalendarLastChecked, dateContext, dateWindowKey, loadCalendarData, parkId, parkRefreshKey, parkSlug, router]);

  useEffect(() => {
    if (activeTab === "sites" || activeTab === "rules") {
      void loadSiteData();
    }
  }, [activeTab, loadSiteData]);

  useEffect(() => {
    if (activeTab === "reviews") {
      void loadReviewData();
    }
  }, [activeTab, loadReviewData]);

  useEffect(() => {
    if (activeTab === "sites" || activeTab === "calendar") {
      void refreshLiveAvailability({ park: true });
    }
  }, [activeTab, refreshLiveAvailability]);

  useEffect(() => {
    if (activeTab === "calendar") {
      void loadCalendarData();
    }
  }, [activeTab, loadCalendarData]);

  const openSiteFlyout = useCallback(async (siteId: string) => {
    const site = activeSites.find((candidate) => candidate.id === siteId);
    if (site) {
      setSelectedSiteDetails({
        site,
        parkName,
        parkSlug,
        operatorName,
        operatorId,
        bookingUrl: activeBookingUrls[site.id],
        equipment: equipmentOptions,
        calendarRow: activeCalendarRows.find((row) => row.site.id === site.id) ?? null,
        lastCheckedAt: activeAvailabilitySummary[site.id]?.last_checked_at ?? activeCalendarLastChecked,
        stats: activeSiteStats.find((entry) => entry.id === site.id) ?? null,
        recentReviews: activeRecentSiteReviews.filter((review) => review.site_id === site.id),
      });
    }
    void refreshLiveAvailability({ siteId });

    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/details`);
      if (!response.ok) throw new Error("Failed to load site details");
      const payload = (await response.json()) as { details?: SiteFlyoutDetails };
      if (!payload.details) throw new Error("Missing site details");
      setSelectedSiteDetails({
        ...payload.details,
        bookingUrl: activeBookingUrls[siteId] ?? payload.details.bookingUrl,
      });
    } catch {
      // Keep the lightweight local details open; the direct booking link still works.
    }
  }, [
    activeBookingUrls,
    activeAvailabilitySummary,
    activeCalendarLastChecked,
    activeCalendarRows,
    activeSiteStats,
    activeSites,
    equipmentOptions,
    operatorId,
    operatorName,
    parkName,
    parkSlug,
    activeRecentSiteReviews,
    refreshLiveAvailability,
  ]);

  const closeSiteFlyout = useCallback(() => {
    setSelectedSiteDetails(null);
  }, []);

  const siteTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of activeSites) {
      const k = s.site_type_label ?? s.site_type;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [activeSites]);

  const sortedSites = useMemo(
    () => [...activeSites].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [activeSites],
  );

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
    () => Object.values(activeAvailabilitySummary).filter((a) => a.status === "available").length,
    [activeAvailabilitySummary],
  );
  const weatherRange = dateContext.mode === "range"
    ? { from: dateContext.from, to: dateContext.to }
    : { from: dateContext.date, to: dateContext.date };

  return (
    <section className="mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <DateFilter ctx={dateContext} />

      {/* Sticky-ish tab strip */}
      <div className="relative mt-4 min-w-0 border-b border-stone-200">
        <div className="flex min-w-0 items-end gap-1 overflow-x-auto scrollbar-none sm:pr-48">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
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
        {parkRefreshInFlight && (
          <>
            <span className="sr-only" aria-live="polite">
              Updating availability in the background.
            </span>
            <div className="pointer-events-none absolute right-0 top-1/2 hidden -translate-y-1/2 items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-stone-600 shadow-sm ring-1 ring-stone-200 backdrop-blur sm:inline-flex">
              <Loader2 size={11} className="animate-spin text-forest-700" />
              Updating in background
            </div>
          </>
        )}
      </div>

      <div id="park-tab-content" className="mt-6 grid w-full min-w-0 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="min-w-0 lg:col-span-2">
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
                      {activeCampMapSummaries.length} {activeCampMapSummaries.length === 1 ? "section" : "sections"} · click any card to open in the Sites tab
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {activeCampMapSummaries.map((m) => {
                      const showAvailability = !m.availability_pending;
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
                              src={mapImageUrl(m.image_url)}
                              alt={m.name ?? "Campground section"}
                              className="absolute inset-0 h-full w-full object-cover opacity-90 group-hover:scale-[1.03] transition-transform duration-500"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                            {showAvailability && (
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
                            )}
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
                className="min-w-0"
              >
                <div className="mb-4 flex w-fit max-w-full min-w-0 items-center gap-1 overflow-x-auto rounded-lg bg-stone-100 p-1 ring-1 ring-stone-200 scrollbar-none">
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

                {siteLoadStatus !== "ready" && activeSites.length === 0 ? (
                  <div className="card p-8 text-center text-sm text-stone-500">
                    {siteLoadStatus === "error" ? "Site data could not be loaded. Switch tabs and open Sites again to retry." : "Loading campsite data..."}
                  </div>
                ) : sitesSubTab === "map" ? (
                  <>
                    {activeCampMapSummaries.length === 0 ? (
                      <SiteDirectoryFallback
                        sites={sortedSites}
                        availabilitySummary={activeAvailabilitySummary}
                        bookingUrls={activeBookingUrls}
                        operatorName={operatorName}
                        onOpenSiteDetails={openSiteFlyout}
                      />
                    ) : (
                      <>
                        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                          <h2 className="text-xl font-semibold tracking-tight">Campground layout</h2>
                          <span className="text-xs text-stone-500">
                            Click any site for details · open in {operatorName} to book
                          </span>
                        </div>
                        <CampgroundMap
                          campMaps={activeCampMapSummaries}
                          sites={activeSites}
                          availabilitySummary={activeAvailabilitySummary}
                          bookingUrls={activeBookingUrls}
                          operatorName={operatorName}
                          equipmentOptions={equipmentOptions}
                          initialMapId={selectedSection}
                          onOpenSiteDetails={openSiteFlyout}
                        />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">Field Notes</h2>
                      <span className="text-xs text-stone-500">
                        Stats, ratings, and popularity rankings for this park&apos;s campsites
                      </span>
                    </div>
                      <SiteFieldNotes
                        totalSites={activeTotalSites}
                        availableCount={availableNowCount}
                        siteStats={activeSiteStats}
                        recentSiteReviews={activeRecentSiteReviews}
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
                {(calendarLoadStatus === "idle" || calendarLoadStatus === "loading") && (
                  <div className="card p-8 text-center text-sm text-stone-500">
                    Loading the full park calendar...
                  </div>
                )}
                {calendarLoadStatus === "error" && (
                  <div className="card p-8 text-center text-sm text-stone-500">
                    Calendar data could not be loaded. Switch tabs and open it again to retry.
                  </div>
                )}
                {calendarLoadStatus === "ready" && (
                  <AvailabilityCalendar
                    rows={activeCalendarRows}
                    totalSites={activeTotalSites}
                    lastCheckedAt={activeCalendarLastChecked}
                    vendorSiteIds={activeVendorSiteIds}
                    bookingUrls={activeBookingUrls}
                    vendorUrl={vendorUrl}
                    onOpenSiteDetails={openSiteFlyout}
                    initialDate={dateContext.mode === "range" ? dateContext.from : dateContext.date}
                    selectedRange={dateContext.mode === "range" ? { from: dateContext.from, to: dateContext.to } : null}
                  />
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
                  {activeParkReviewAggregate.review_count > 0 && (
                    <span className="text-xs text-stone-500">
                      {activeParkReviewAggregate.review_count} park {activeParkReviewAggregate.review_count === 1 ? "review" : "reviews"}
                    </span>
                  )}
                </div>

                {(reviewLoadStatus === "idle" || reviewLoadStatus === "loading") && (
                  <div className="card p-8 text-center text-sm text-stone-500">
                    Loading reviews...
                  </div>
                )}
                {reviewLoadStatus === "error" && (
                  <div className="card p-8 text-center text-sm text-stone-500">
                    Reviews could not be loaded. Switch tabs and open Reviews again to retry.
                  </div>
                )}
                {reviewLoadStatus === "ready" && (
                  <>
                    <ParkReviewAggregateDisplay aggregate={activeParkReviewAggregate} />
                    <ParkReviewList reviews={activeParkReviews} siteReviews={activeRecentSiteReviews} />
                  </>
                )}
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
                {siteLoadStatus !== "ready" && activeSites.length === 0 ? (
                  <div className="card p-8 text-center text-sm text-stone-500">
                    {siteLoadStatus === "error" ? "Site rules could not be loaded. Switch tabs and open Rules again to retry." : "Loading site rules..."}
                  </div>
                ) : (
                  <RulesPanel
                    parkName={parkName}
                    operatorName={operatorName}
                    operatorRuleSource={operatorRuleSource}
                    sites={activeSites}
                    totalSites={activeTotalSites}
                    lastCheckedAt={activeCalendarLastChecked}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="card overflow-hidden">
            <ParkLocationMap parkName={parkName} location={parkLocation} />
            <div className="border-b border-stone-100 p-2">
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <WeatherStrip
                  lat={parkLocation.lat}
                  lng={parkLocation.lng}
                  from={weatherRange.from}
                  to={weatherRange.to}
                />
                <ParkAlertsStrip
                  operatorId={operatorId}
                  parkName={parkName}
                  sourceUrl={operatorRuleSource?.alerts_url ?? undefined}
                />
              </div>
            </div>
            <div className="p-5">
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
                <dd className="font-medium tabular-nums">{activeTotalSites.toLocaleString()}</dd>
                <dt className="text-stone-500">Sections</dt>
                <dd className="font-medium tabular-nums">{activeCampMapSummaries.length}</dd>
                <dt className="text-stone-500">Avg open</dt>
                <dd className="font-medium tabular-nums">{activeAvgAvailability}%</dd>
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

          {activeCalendarLastChecked && (
            <div className="card p-5 text-sm text-stone-600 leading-relaxed">
              <div className="font-semibold text-stone-900 mb-1.5">Freshness</div>
              We last checked {operatorName} {timeAgo(activeCalendarLastChecked)}. Background batches run continuously; opening live availability requests a fresh site check.
            </div>
          )}
        </aside>
      </div>

      <SiteDetailFlyout
        details={selectedSiteDetails}
        onClose={closeSiteFlyout}
        checkingLive={Boolean(selectedSiteDetails && refreshingSiteId === selectedSiteDetails.site.id)}
      />
    </section>
  );
}
