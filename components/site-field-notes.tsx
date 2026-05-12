"use client";

import Link from "next/link";
import { Star, Flame, TrendingUp, Tent, Zap, Waves, Dog, ArrowUpRight, BarChart3, MessageSquare } from "lucide-react";
import type { SiteReview } from "@/lib/types";

export type SiteStatsEntry = {
  id: string;
  vendorSiteId: string;
  name: string;
  siteTypeLabel: string;
  hasElectric: boolean;
  isWaterfront: boolean;
  isPetFriendly: boolean;
  totalNights: number;
  availableNights: number;
  reservedNights: number;
  reviewCount: number;
  ratingAvg: number | null;
};

type Props = {
  parkSlug: string;
  totalSites: number;
  availableCount: number;
  siteStats: SiteStatsEntry[];
  recentSiteReviews: Array<SiteReview & { site_name: string }>;
  vendorSiteIds: Record<string, string>;
  onOpenSiteDetails?: (siteId: string) => void;
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={12}
          className={i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-stone-300"}
        />
      ))}
    </span>
  );
}

function MiniStat({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: typeof Tent;
  title: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="card p-4 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-forest-400 to-forest-600" />
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-stone-500 uppercase tracking-wide font-semibold">{title}</div>
        <Icon size={12} className="text-stone-400" />
      </div>
      <div className="mt-1.5 text-lg font-semibold text-stone-900 leading-tight">{value}</div>
      <div className="mt-0.5 text-xs text-stone-500 leading-tight">{sub}</div>
    </div>
  );
}

export function SiteFieldNotes({
  parkSlug,
  totalSites,
  availableCount,
  siteStats,
  recentSiteReviews,
  vendorSiteIds,
  onOpenSiteDetails,
}: Props) {
  const withBooking = siteStats.filter((s) => s.totalNights > 0);
  const withReviews = siteStats.filter(
    (s) => s.reviewCount > 0 && s.ratingAvg !== null,
  );

  const popularityRanking = [...withBooking]
    .map((s) => {
      const bookable = s.availableNights + s.reservedNights;
      return {
        ...s,
        bookableNights: bookable,
        bookingRate: bookable > 0 ? s.reservedNights / bookable : 0,
      };
    })
    .sort((a, b) => b.bookingRate - a.bookingRate);

  const bestRated = [...withReviews].sort(
    (a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0),
  );

  const electricCount = siteStats.filter((s) => s.hasElectric).length;
  const waterfrontCount = siteStats.filter((s) => s.isWaterfront).length;
  const petFriendlyCount = siteStats.filter((s) => s.isPetFriendly).length;

  const hottest = popularityRanking[0];
  const topRated = bestRated[0];
  const availPct =
    totalSites > 0 ? Math.round((availableCount / totalSites) * 100) : 0;

  function siteUrl(vendorSiteId: string) {
    return `/park/${parkSlug}/site/${vendorSiteId}`;
  }

  function siteAction(
    site: Pick<SiteStatsEntry, "id" | "vendorSiteId" | "name">,
    className: string,
  ) {
    if (onOpenSiteDetails) {
      return (
        <button
          type="button"
          onClick={() => onOpenSiteDetails(site.id)}
          className={`${className} text-left`}
        >
          {site.name}
        </button>
      );
    }
    return (
      <Link href={siteUrl(site.vendorSiteId)} className={className}>
        {site.name}
      </Link>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3">
        <MiniStat
          icon={Tent}
          title="Total sites"
          value={<span className="tabular-nums">{totalSites}</span>}
          sub={`${siteStats.length} sites tracked`}
        />
        <MiniStat
          icon={TrendingUp}
          title="Open now"
          value={<span className="tabular-nums">{availPct}%</span>}
          sub={`${availableCount} of ${totalSites} available`}
        />
        <MiniStat
          icon={Flame}
          title="Most popular"
          value={
            hottest ? (
              siteAction(hottest, "hover:text-forest-700 transition-colors truncate block")
            ) : (
              "\u2014"
            )
          }
          sub={
            hottest
              ? `${hottest.reservedNights} of ${hottest.bookableNights} nights booked (${Math.round(hottest.bookingRate * 100)}%)`
              : "No availability data"
          }
        />
        <MiniStat
          icon={Star}
          title="Top rated"
          value={
            topRated ? (
              siteAction(topRated, "hover:text-forest-700 transition-colors truncate block")
            ) : (
              "\u2014"
            )
          }
          sub={
            topRated
              ? `${topRated.ratingAvg!.toFixed(1)} \u2605 \u00B7 ${topRated.reviewCount} review${topRated.reviewCount !== 1 ? "s" : ""}`
              : "No reviews yet"
          }
        />
      </div>

      {popularityRanking.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
            <Flame size={16} className="text-orange-500" />
            Campsite Popularity
          </h3>
          <p className="text-xs text-stone-500 mt-0.5 mb-3">
            Sites ranked by booking rate &mdash; how many bookable nights are reserved.
          </p>
          <div className="card divide-y divide-stone-100">
            {popularityRanking.slice(0, 10).map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-xs text-stone-400 w-5 shrink-0 tabular-nums font-medium">
                  {i + 1}
                </span>
                {siteAction(
                  s,
                  "flex-1 min-w-0 text-sm font-medium text-stone-800 hover:text-forest-700 truncate transition-colors",
                )}
                <span className="chip bg-stone-100 text-stone-600 shrink-0 hidden sm:inline-flex">
                  {s.siteTypeLabel}
                </span>
                <div className="w-24 shrink-0 hidden sm:block">
                  <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500"
                      style={{
                        width: `${Math.round(s.bookingRate * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-xs font-semibold tabular-nums text-stone-700 shrink-0">
                  {Math.round(s.bookingRate * 100)}%
                </span>
                <span className="text-[10px] text-stone-500 tabular-nums shrink-0 hidden sm:inline">
                  {s.reservedNights}/{s.bookableNights}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {bestRated.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
            <Star size={16} className="text-amber-500" />
            Highest Rated
          </h3>
          <p className="text-xs text-stone-500 mt-0.5 mb-3">
            Sites reviewed by campers, ranked by overall rating.
          </p>
          <div className="card divide-y divide-stone-100">
            {bestRated.slice(0, 10).map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-xs text-stone-400 w-5 shrink-0 tabular-nums font-medium">
                  {i + 1}
                </span>
                {siteAction(
                  s,
                  "flex-1 min-w-0 text-sm font-medium text-stone-800 hover:text-forest-700 truncate transition-colors",
                )}
                <span className="chip bg-stone-100 text-stone-600 shrink-0 hidden sm:inline-flex">
                  {s.siteTypeLabel}
                </span>
                <StarRating rating={Math.round(s.ratingAvg!)} />
                <span className="text-xs text-stone-500 tabular-nums shrink-0">
                  ({s.reviewCount})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
          <BarChart3 size={16} className="text-forest-600" />
          Site Features
        </h3>
        <p className="text-xs text-stone-500 mt-0.5 mb-3">
          Breakdown of amenities and features across all sites.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <Zap size={18} className="mx-auto text-amber-500 mb-1.5" />
            <div className="text-xl font-semibold tabular-nums text-stone-900">
              {electricCount}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">Electric</div>
          </div>
          <div className="card p-4 text-center">
            <Waves size={18} className="mx-auto text-lake-500 mb-1.5" />
            <div className="text-xl font-semibold tabular-nums text-stone-900">
              {waterfrontCount}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">Waterfront</div>
          </div>
          <div className="card p-4 text-center">
            <Dog size={18} className="mx-auto text-forest-600 mb-1.5" />
            <div className="text-xl font-semibold tabular-nums text-stone-900">
              {petFriendlyCount}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">Pet-friendly</div>
          </div>
        </div>
      </div>

      {recentSiteReviews.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
            <MessageSquare size={16} className="text-forest-600" />
            Recent Campsite Reviews
          </h3>
          <p className="text-xs text-stone-500 mt-0.5 mb-3">
            What campers are saying about specific sites.
          </p>
          <div className="space-y-3">
            {recentSiteReviews.map((r) => {
              const vid = vendorSiteIds[r.site_id];
              return (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {vid ? (
                          onOpenSiteDetails ? (
                            <button
                              type="button"
                              onClick={() => onOpenSiteDetails(r.site_id)}
                              className="text-left text-sm font-semibold text-stone-900 hover:text-forest-700 transition-colors"
                            >
                              {r.site_name}
                            </button>
                          ) : (
                            <Link
                              href={siteUrl(vid)}
                              className="text-sm font-semibold text-stone-900 hover:text-forest-700 transition-colors"
                            >
                              {r.site_name}
                            </Link>
                          )
                        ) : (
                          <span className="text-sm font-semibold text-stone-900">
                            {r.site_name}
                          </span>
                        )}
                        <StarRating rating={r.overall} />
                      </div>
                      {r.title && (
                        <div className="text-sm font-medium text-stone-700 mt-1">
                          {r.title}
                        </div>
                      )}
                      <p className="text-sm text-stone-600 mt-1 line-clamp-2">
                        {r.body}
                      </p>
                    </div>
                    {vid && (
                      onOpenSiteDetails ? (
                        <button
                          type="button"
                          onClick={() => onOpenSiteDetails(r.site_id)}
                          className="text-stone-400 hover:text-forest-700 shrink-0 transition-colors"
                          aria-label={`Open site ${r.site_name}`}
                        >
                          <ArrowUpRight size={14} />
                        </button>
                      ) : (
                        <Link
                          href={siteUrl(vid)}
                          className="text-stone-400 hover:text-forest-700 shrink-0 transition-colors"
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
