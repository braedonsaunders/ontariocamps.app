"use client";
import Link from "next/link";
import { motion } from "motion/react";
import type { SearchResult } from "@/lib/types";
import { AMENITIES } from "@/lib/types";
import { formatPrice, timeAgo } from "@/lib/utils";
import { ArrowUpRight, MapPin, Calendar, Wifi, Droplet, Flame, Tent, Caravan } from "lucide-react";

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

export function ResultCard({ result }: { result: SearchResult }) {
  const operatorClass =
    result.park.operator_id === "ontario_parks"
      ? "bg-forest-100 text-forest-800 ring-forest-200"
      : result.park.operator_id === "parks_canada"
      ? "bg-red-50 text-red-800 ring-red-200"
      : "bg-lake-100 text-lake-800 ring-lake-200";

  return (
    <motion.div
      className="card p-4 hover:ring-stone-300 transition-shadow"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, boxShadow: "0 8px 24px -8px rgba(0,0,0,0.08)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`chip ring-1 ${operatorClass}`}>{result.park.operator}</span>
            {result.park.distance_km != null && (
              <span className="text-xs text-stone-500 flex items-center gap-1">
                <MapPin size={11} /> {result.park.distance_km.toFixed(0)} km away
              </span>
            )}
          </div>
          <Link href={`/park/${result.park.slug}`} className="font-semibold hover:text-forest-700">
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
        <div className="mt-3 flex items-center gap-2 text-sm text-stone-700">
          <Calendar size={14} className="text-forest-700 shrink-0" />
          <span className="font-medium">{result.availability.nights.length} night{result.availability.nights.length > 1 ? "s" : ""}</span>
          <span className="text-stone-400">·</span>
          <span className="text-stone-600 truncate">
            {result.availability.nights[0]} → {result.availability.nights[result.availability.nights.length - 1]}
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {result.site.rule_highlights?.slice(0, 4).map((rule) => (
          <span key={rule.label} className={`chip ring-1 ${ruleToneClass(rule.tone)}`}>
            {rule.label}
          </span>
        ))}
        {result.site.amenities.slice(0, 6).map((code) => (
          <span key={code} className="chip bg-stone-100 text-stone-700">
            <AmenityIcon code={code} />
            {AMENITIES[code]?.label ?? code}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-stone-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Checked {timeAgo(result.availability.last_checked_at)}
        </span>
        <a
          href={result.booking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-forest-700 hover:text-forest-800"
        >
          Book on {result.park.operator} <ArrowUpRight size={13} />
        </a>
      </div>
    </motion.div>
  );
}
