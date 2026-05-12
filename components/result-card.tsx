"use client";
import Link from "next/link";
import { motion } from "motion/react";
import type { SearchResult } from "@/lib/types";
import { AMENITIES } from "@/lib/types";
import { formatPrice, timeAgo } from "@/lib/utils";
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
}: {
  result: SearchResult;
  onOpenResult?: (result: SearchResult) => void;
  onOpenSiteDetails?: (siteId: string, bookingUrl?: string) => void;
  loadingSiteId?: string | null;
}) {
  const segments = result.stay?.segments ?? [result];
  const isRoute = segments.length > 1;
  const thumbnail = result.site.thumbnail_url;
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
      className={`card overflow-hidden transition-shadow hover:ring-stone-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 ${
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
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 p-3">
        <div className="relative h-full min-h-[8rem] overflow-hidden rounded-md bg-stone-100 ring-1 ring-stone-200">
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail} alt={`${result.park.name} site ${result.site.name}`} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-forest-700">
              <SiteIcon type={result.site.site_type} />
            </div>
          )}
          {result.stay && result.stay.segment_count > 1 && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-stone-700 shadow-sm ring-1 ring-stone-200">
              {result.stay.segment_count} stops
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`chip ring-1 ${operatorClass}`}>{result.park.operator}</span>
                {result.stay && (
                  <span className="chip bg-stone-100 text-stone-700 ring-1 ring-stone-200">
                    <Route size={11} /> {result.stay.label}
                  </span>
                )}
                {result.park.distance_km != null && (
                  <span className="text-xs text-stone-500 flex items-center gap-1">
                    <MapPin size={11} /> {result.park.distance_km.toFixed(0)} km away
                  </span>
                )}
              </div>
              <Link
                href={`/park/${result.park.slug}`}
                className="font-semibold hover:text-forest-700"
                onClick={(e) => e.stopPropagation()}
              >
                {result.park.name}
              </Link>
              <div className="text-sm text-stone-600 mt-0.5">
                {result.campground.name} ·{" "}
                <span className="inline-flex items-center gap-1">
                  <SiteIcon type={result.site.site_type} /> Site {result.site.name}
                  {result.site.site_type_label ? ` · ${result.site.site_type_label}` : ""}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-semibold">{formatPrice(result.availability.price_cents)}</div>
              <div className="text-[11px] text-stone-500">/ night</div>
            </div>
          </div>

          {result.availability.nights.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-sm text-stone-700">
              <Calendar size={14} className="text-forest-700 shrink-0" />
              <span className="font-medium">{result.availability.nights.length} night{result.availability.nights.length > 1 ? "s" : ""}</span>
              <span className="text-stone-400">·</span>
              <span className="text-stone-600 truncate">
                {result.availability.nights[0]} → {result.availability.nights[result.availability.nights.length - 1]}
              </span>
            </div>
          )}

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

          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.site.rule_highlights?.slice(0, 3).map((rule) => (
              <span key={rule.label} className={`chip ring-1 ${ruleToneClass(rule.tone)}`}>
                {rule.label}
              </span>
            ))}
            {result.site.amenities.slice(0, 4).map((code) => (
              <span key={code} className="chip bg-stone-100 text-stone-700">
                <AmenityIcon code={code} />
                {AMENITIES[code]?.label ?? code}
              </span>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-stone-500">
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
            {onOpenSiteDetails && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openResult();
                }}
                className="inline-flex shrink-0 items-center gap-1 font-medium text-stone-600 hover:text-stone-950"
              >
                {loadingSiteId === result.site.id ? <Loader2 size={13} className="animate-spin" /> : null}
                {isRoute ? "View sites" : "Details"}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
