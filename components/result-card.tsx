"use client";
import { motion } from "motion/react";
import type { SearchResult } from "@/lib/types";
import { AMENITIES } from "@/lib/types";
import { displayOperatorName } from "@/lib/display";
import { imageProxyUrl } from "@/lib/image-proxy";
import { timeAgo } from "@/lib/utils";
import { WeatherStrip } from "@/components/weather-strip";
import { ParkAlertsStrip } from "@/components/park-alerts-strip";
import { ArrowUpRight, MapPin, Calendar, Wifi, Droplet, Flame, Tent, Caravan, Route, Loader2 } from "lucide-react";

function SiteIcon({ type }: { type: string }) {
  if (type === "rv") return <Caravan size={14} />;
  return <Tent size={14} />;
}

function AmenityIcon({ code }: { code: string }) {
  if (code.startsWith("electric")) return <Wifi size={12} />;
  if (code === "water" || code === "sewer" || code === "waterfront" || code === "lake_swim") return <Droplet size={12} />;
  if (code === "fire_pit") return <Flame size={12} />;
  return null;
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(date);
}

function ruleToneClass(tone?: string) {
  if (tone === "emerald") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (tone === "amber") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (tone === "red") return "bg-red-50 text-red-700 ring-red-200";
  if (tone === "lake") return "bg-lake-50 text-lake-800 ring-lake-200";
  return "bg-stone-100 text-stone-700 ring-stone-200";
}

export function ResultCard({
  result,
  onOpenResult,
  onOpenSiteDetails,
  loadingSiteId,
  dense = false,
}: {
  result: SearchResult;
  onOpenResult?: (result: SearchResult) => void;
  onOpenSiteDetails?: (siteId: string, bookingUrl?: string) => void;
  loadingSiteId?: string | null;
  dense?: boolean;
}) {
  const segments = result.stay?.segments ?? [result];
  const isRoute = segments.length > 1;
  const thumbnail = imageProxyUrl(result.site.thumbnail_url, "card");
  const firstNight = result.availability.nights[0];
  const lastNight = result.availability.nights[result.availability.nights.length - 1];
  const compactRules = result.site.rule_highlights?.slice(0, 2) ?? [];
  const compactAmenities = result.site.amenities.slice(0, Math.max(0, 3 - compactRules.length));
  const operatorName = displayOperatorName(result.park.operator);
  const canOpen = Boolean(onOpenResult || onOpenSiteDetails);
  const openLabel = isRoute
    ? `Open all sites for ${result.stay?.label ?? "this route"} starting at ${result.park.name} site ${result.site.name}`
    : `Open details for ${result.park.name} site ${result.site.name}`;
  const openResult = () => {
    if (isRoute && onOpenResult) {
      onOpenResult(result);
      return;
    }
    onOpenSiteDetails?.(result.site.id, result.booking_url);
  };
  const operatorClass =
    result.park.operator_id === "ontario_parks"
      ? "bg-forest-100 text-forest-800 ring-forest-200"
      : result.park.operator_id === "parks_canada"
      ? "bg-red-50 text-red-800 ring-red-200"
      : "bg-lake-100 text-lake-800 ring-lake-200";

  return (
    <motion.div
      className={`card relative overflow-hidden transition-shadow hover:ring-stone-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 ${
        canOpen ? "cursor-pointer" : ""
      }`}
      onClick={openResult}
      onKeyDown={(event) => {
        if (!canOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openResult();
        }
      }}
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-label={canOpen ? openLabel : undefined}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.08)" }}
    >
      {thumbnail ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnail}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.90] via-white/[0.55] to-white/[0.08]" />
          <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.75] via-white/[0.35] to-transparent" />
          <div className="absolute bottom-0 left-0 h-2/3 w-2/3 bg-white/[0.18] blur-xl" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-forest-50 via-white to-lake-50" />
      )}

      <div className={`relative z-10 ${dense ? "p-2 sm:p-2 lg:p-2" : "p-2.5 sm:p-3"}`}>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-stone-500">
                <span className={`hidden shrink-0 rounded-full px-1.5 py-0.5 font-medium ring-1 sm:inline-flex ${operatorClass}`}>{operatorName}</span>
                {result.stay && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-1.5 py-0.5 font-medium text-stone-700 ring-1 ring-stone-200">
                    <Route size={11} /> {result.stay.label}
                  </span>
                )}
                {result.park.distance_km != null && (
                  <span className="inline-flex min-w-0 items-center gap-1 truncate">
                    <MapPin size={11} /> {result.park.distance_km.toFixed(0)} km away
                  </span>
                )}
              </div>
              <div className={`block truncate text-sm font-semibold leading-tight text-stone-950 ${dense ? "sm:text-base lg:text-sm" : "sm:text-base"}`}>
                {result.park.name}
              </div>
              <div className={`mt-0.5 truncate text-xs text-stone-600 ${dense ? "sm:text-sm lg:text-xs" : "sm:text-sm"}`}>
                {result.campground.name} ·{" "}
                <span className="inline-flex items-center gap-1">
                  <SiteIcon type={result.site.site_type} /> Site {result.site.name}
                  {result.site.site_type_label ? ` · ${result.site.site_type_label}` : ""}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Site</div>
              <div className={`mt-0.5 rounded-md bg-white/80 px-2 font-semibold leading-none text-stone-950 shadow-sm ring-1 ring-stone-200 ${
                dense ? "py-0.5 text-base sm:text-lg lg:text-base" : "py-1 text-base sm:text-lg"
              }`}>
                {result.site.name}
              </div>
            </div>
          </div>

          {result.stay && result.stay.segment_count > 1 && (
            <span className="mt-1 inline-flex rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-stone-700 shadow-sm ring-1 ring-stone-200">
              {result.stay.segment_count} stops
            </span>
          )}

          {result.availability.nights.length > 0 && (
            <div className={`mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-stone-700 ${dense ? "sm:text-sm lg:text-xs" : "sm:text-sm"}`}>
              <Calendar size={13} className="shrink-0 text-forest-700 sm:size-[14px]" />
              <span className="font-medium">{result.availability.nights.length} night{result.availability.nights.length > 1 ? "s" : ""}</span>
              <span className="text-stone-400">·</span>
              <span className="text-stone-600 truncate">
                {shortDate(firstNight)} → {shortDate(lastNight)}
              </span>
              <WeatherStrip
                lat={result.park.location.lat}
                lng={result.park.location.lng}
                from={firstNight}
                to={lastNight}
                compact
                className="ml-0.5"
              />
            </div>
          )}

          <div className={dense ? "lg:hidden" : undefined}>
            <ParkAlertsStrip
              operatorId={result.park.operator_id}
              parkName={result.park.name}
              compact
            />
          </div>

          {segments.length > 1 && (
            <div className="mt-2 grid gap-1.5">
              {segments.slice(0, 4).map((segment, index) => (
                <button
                  key={`${segment.site.id}-${segment.availability.nights.join("-")}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSiteDetails?.(segment.site.id, segment.booking_url);
                  }}
                  className="flex items-center gap-2 rounded-md bg-stone-50 px-2 py-1 text-left text-xs text-stone-600 ring-1 ring-stone-200 transition hover:bg-white hover:ring-forest-200"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-forest-700 ring-1 ring-stone-200">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {segment.availability.nights.join(", ")} · {segment.park.name} · site {segment.site.name}
                  </span>
                </button>
              ))}
              {segments.length > 4 && <div className="text-xs text-stone-500">+ {segments.length - 4} more moves</div>}
            </div>
          )}

          <div className={`mt-1.5 flex max-w-full items-center gap-1 overflow-hidden ${dense ? "lg:hidden" : ""}`}>
            {compactRules.map((rule) => (
              <span key={rule.label} className={`chip shrink-0 ring-1 ${ruleToneClass(rule.tone)}`}>
                {rule.label}
              </span>
            ))}
            {compactAmenities.map((code) => (
              <span key={code} className="chip shrink-0 bg-stone-100 text-stone-700">
                <AmenityIcon code={code} />
                {AMENITIES[code]?.label ?? code}
              </span>
            ))}
            {(result.site.rule_highlights?.length ?? 0) + result.site.amenities.length > compactRules.length + compactAmenities.length && (
              <span className="chip shrink-0 bg-stone-50 text-stone-500 ring-1 ring-stone-200">
                +{(result.site.rule_highlights?.length ?? 0) + result.site.amenities.length - compactRules.length - compactAmenities.length}
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-stone-500">
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate">Checked {timeAgo(result.availability.last_checked_at)}</span>
            </span>
            <a
              href={result.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-1 font-medium text-forest-700 hover:text-forest-800"
            >
              Book <ArrowUpRight size={13} />
            </a>
            {loadingSiteId === result.site.id && <Loader2 size={13} className="shrink-0 animate-spin text-stone-500" />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
