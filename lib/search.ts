/**
 * Search — Postgres-native version. Uses ST_DWithin for the radius filter
 * (PostGIS index does the heavy lifting) and SQL joins for the per-night
 * availability check.
 */

import { sql } from "./db/client";
import { PRESET_LOCATIONS } from "./locations";
import { buildBookingUrl } from "./booking-url";
import { displayOperatorName } from "./display";
import { allowedEquipmentSupportsLength } from "./equipment-normalization";
import type {
  SearchResponse,
  SearchResult,
  SearchResultAvailability,
  SearchResultCampground,
  SearchResultGroup,
  SearchResultPark,
  SearchResultSegment,
  SearchResultSite,
  SearchGroupMode,
  SearchSortMode,
  SearchStayMode,
  SitePhoto,
  SiteType,
  Operator,
} from "./types";
import { eachDate } from "./utils";

export { PRESET_LOCATIONS };

export type SearchParams = {
  lat?: number;
  lng?: number;
  end_lat?: number;
  end_lng?: number;
  radius_km?: number;
  start_date?: string;
  end_date?: string;
  min_nights?: number;
  flexible?: boolean;
  party_size?: number;
  equipment?: string;
  site_types?: string[];
  amenities?: string[];
  operators?: string[];
  park_slugs?: string[];
  equipment_length_ft?: number;
  stay_mode?: SearchStayMode;
  group_by?: SearchGroupMode;
  group_limit?: number;
  group_offset?: number;
  group_result_limit?: number;
  limit?: number;
  offset?: number;
  sort?: SearchSortMode;
};

const DEFAULT_LIMIT = 30;
const SEASONAL_SITE_LABEL_PATTERN = "(^|[^a-z])(seasonal|full[-\\s]?season|monthly|annual|permanent|long[-\\s]?term)([^a-z]|$)";

function emptySearchResponse(): SearchResponse {
  return {
    results: [],
    total: 0,
    freshness_p50_minutes: 0,
  };
}

type SearchRow = {
  park_id: string;
  park_slug: string;
  park_name: string;
  park_lat: number;
  park_lng: number;
  operator_id: string;
  operator_name: string;
  vendor_url: string;
  park_hero_image_url: string | null;
  site_id: string;
  site_name: string;
  site_type: string;
  site_type_label: string | null;
  site_max_equipment_length_ft: number | null;
  site_amenities: string[];
  site_rule_summary: unknown;
  site_allowed_equipment: unknown;
  site_has_electric: boolean;
  site_has_water: boolean;
  site_has_sewer: boolean;
  site_is_pull_through: boolean;
  site_is_accessible: boolean;
  site_is_pet_friendly: boolean;
  site_is_waterfront: boolean;
  site_photos: unknown;
  campground_id: string;
  campground_name: string;
  matched_nights: (Date | string)[];
  last_checked_at: Date;
  distance_m: number | null;
};

type PreparedRow = {
  raw: SearchRow;
  matchedNights: string[];
  lastChecked: string;
  site: SearchResultSite;
  campground: SearchResultCampground;
  park: SearchResultPark;
  availabilityCount: number;
};

function firstPhotoUrl(raw: unknown): string | null {
  const photos = Array.isArray(raw) ? (raw as SitePhoto[]) : [];
  for (const photo of photos) {
    const url = photo.url ?? photo.avifUrl;
    if (url) return url;
  }
  return null;
}

function normalizeNights(nights: (Date | string)[]): string[] {
  return nights
    .map((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)))
    .sort();
}

function checkoutDate(lastNight: string | undefined, fallback?: string): string | undefined {
  if (!lastNight) return fallback;
  const d = new Date(`${lastNight}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function distinctCount<T>(values: T[]): number {
  return new Set(values).size;
}

function stayLabel(mode: SearchStayMode, moveCount: number, parkCount: number): string {
  if (mode === "same_site") return "Same site";
  if (mode === "same_park") return `${moveCount + 1} sites in park`;
  if (parkCount > 1) return `${parkCount} parks · ${moveCount} moves`;
  return moveCount > 0 ? `${moveCount + 1} sites · ${moveCount} moves` : "One-site route";
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function ruleSetup(raw: unknown): {
  electricalService?: unknown;
  serviceType?: unknown;
  pullThrough?: unknown;
} {
  if (!raw || typeof raw !== "object") return {};
  return ((raw as { setup?: object }).setup ?? {}) as {
    electricalService?: unknown;
    serviceType?: unknown;
    pullThrough?: unknown;
  };
}

function hasAmp(text: string, amp: 15 | 30 | 50): boolean {
  return new RegExp(`\\b${amp}\\b`, "i").test(text) && /\b(?:a|amp|amps|hydro|electric)/i.test(text);
}

function deriveAmenities(row: SearchRow): string[] {
  const raw = Array.isArray(row.site_amenities) ? row.site_amenities.filter(Boolean) : [];
  const setup = ruleSetup(row.site_rule_summary);
  const text = [
    row.site_type_label,
    ...raw,
    typeof setup.electricalService === "string" ? setup.electricalService : null,
    typeof setup.serviceType === "string" ? setup.serviceType : null,
  ].filter(Boolean).join(" ");
  const electricText = !/\b(?:unserviced|non[-\s]?electric)\b/i.test(text) && /\b(?:serviced|electric|hydro)\b/i.test(text);
  const hasElectric = row.site_has_electric || electricText;
  const out = new Set<string>();

  if (hasElectric) {
    if (hasAmp(text, 15)) out.add("electric_15a");
    if (hasAmp(text, 30)) out.add("electric_30a");
    if (hasAmp(text, 50)) out.add("electric_50a");
    if (!out.has("electric_15a") && !out.has("electric_30a") && !out.has("electric_50a")) out.add("electric_30a");
  }
  if (row.site_has_water || /\bwater(?:\s+hook[-\s]?up|\s+hookup)?\b/i.test(text)) out.add("water");
  if (row.site_has_sewer || /\bsewer\b/i.test(text)) out.add("sewer");
  if (row.site_is_pull_through || setup.pullThrough === true || /\bpull[-\s]?through\b/i.test(text)) out.add("pull_through");
  if (row.site_is_accessible || /\baccessible\b/i.test(text)) out.add("accessible");
  if (row.site_is_pet_friendly || /\bpet[-\s]?friendly\b/i.test(text)) out.add("pet_friendly");
  if (row.site_is_waterfront || /\bwaterfront\b/i.test(text)) out.add("waterfront");
  if (/\bbeach\b/i.test(text)) out.add("beach");
  if (/\bswim(?:ming)?\b/i.test(text)) out.add("lake_swim");

  for (const amenity of raw) out.add(amenity);
  return Array.from(out);
}

function prepareRow(r: SearchRow, params: SearchParams): PreparedRow {
  const amenities = deriveAmenities(r);
  const ruleSummary =
    r.site_rule_summary && typeof r.site_rule_summary === "object"
      ? (r.site_rule_summary as { highlights?: SearchResult["site"]["rule_highlights"] })
      : null;
  const lastChecked = r.last_checked_at instanceof Date ? r.last_checked_at.toISOString() : String(r.last_checked_at);
  const distance_km = r.distance_m != null ? r.distance_m / 1000 : undefined;
  const thumbnail = firstPhotoUrl(r.site_photos) ?? r.park_hero_image_url ?? null;

  return {
    raw: r,
    matchedNights: normalizeNights(r.matched_nights),
    lastChecked,
    availabilityCount: Array.isArray(r.matched_nights) ? r.matched_nights.length : 0,
    site: {
      id: r.site_id,
      name: r.site_name,
      site_type: r.site_type as SiteType,
      site_type_label: r.site_type_label,
      thumbnail_url: thumbnail,
      amenities,
      rule_highlights: Array.isArray(ruleSummary?.highlights) ? ruleSummary.highlights.slice(0, 4) : [],
    },
    campground: { id: r.campground_id, name: r.campground_name },
    park: {
      slug: r.park_slug,
      name: r.park_name,
      operator: r.operator_name,
      operator_id: r.operator_id,
      hero_image_url: r.park_hero_image_url,
      location: { lat: r.park_lat, lng: r.park_lng },
      distance_km,
    },
  };
}

function ruleSiteLengthFt(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const setup = (raw as { setup?: { siteLengthM?: unknown } }).setup;
  const metres = setup?.siteLengthM;
  return typeof metres === "number" && Number.isFinite(metres) ? Math.round(metres * 3.28084) : null;
}

function supportsRequestedEquipmentLength(row: SearchRow, requestedLengthFt: number | null | undefined): boolean {
  if (!requestedLengthFt || requestedLengthFt <= 0) return true;
  const allowedSignal = allowedEquipmentSupportsLength(row.site_allowed_equipment, requestedLengthFt);
  if (allowedSignal != null) return allowedSignal;
  if (typeof row.site_max_equipment_length_ft === "number") return row.site_max_equipment_length_ft >= requestedLengthFt;
  const siteLengthFt = ruleSiteLengthFt(row.site_rule_summary);
  if (siteLengthFt != null) return siteLengthFt >= requestedLengthFt;
  return true;
}

function buildSegment(row: PreparedRow, nights: string[], params: SearchParams): SearchResultSegment {
  const availability: SearchResultAvailability = {
    nights,
    price_cents: null,
    last_checked_at: row.lastChecked,
  };

  return {
    site: row.site,
    campground: row.campground,
    park: row.park,
    availability,
    booking_url: buildBookingUrl(row.raw.vendor_url, {
      startDate: nights[0] ?? params.start_date,
      endDate: checkoutDate(nights[nights.length - 1], params.end_date),
    }),
  };
}

function buildSingleResult(row: PreparedRow, nights: string[], params: SearchParams): SearchResult {
  const segment = buildSegment(row, nights, params);
  return {
    ...segment,
    stay: {
      mode: "same_site",
      label: "Same site",
      move_count: 0,
      park_count: 1,
      segment_count: 1,
      segments: [segment],
    },
  };
}

function coversDates(rows: PreparedRow[], dates: string[]): boolean {
  const covered = new Set<string>();
  for (const row of rows) {
    for (const night of row.matchedNights) covered.add(night);
  }
  return dates.every((date) => covered.has(date));
}

function chooseDates(rows: PreparedRow[], requestedDates: string[], flexible: boolean, nightsNeeded: number): string[] | null {
  if (!flexible) return coversDates(rows, requestedDates) ? requestedDates : null;
  const availableDates = requestedDates.filter((date) => rows.some((row) => row.matchedNights.includes(date)));
  return availableDates.length >= nightsNeeded ? availableDates.slice(0, nightsNeeded) : null;
}

function sortCandidates(a: PreparedRow, b: PreparedRow, previous?: PreparedRow | null) {
  if (previous) {
    if (a.site.id === previous.site.id && b.site.id !== previous.site.id) return -1;
    if (b.site.id === previous.site.id && a.site.id !== previous.site.id) return 1;
    if (a.park.slug === previous.park.slug && b.park.slug !== previous.park.slug) return -1;
    if (b.park.slug === previous.park.slug && a.park.slug !== previous.park.slug) return 1;
  }
  if (a.availabilityCount !== b.availabilityCount) return b.availabilityCount - a.availabilityCount;
  if (a.park.distance_km != null && b.park.distance_km != null && a.park.distance_km !== b.park.distance_km) {
    return a.park.distance_km - b.park.distance_km;
  }
  return `${a.park.name} ${a.site.name}`.localeCompare(`${b.park.name} ${b.site.name}`);
}

function buildItinerary(
  rows: PreparedRow[],
  dates: string[],
  params: SearchParams,
  mode: SearchStayMode,
  seed?: PreparedRow,
  options: {
    forceMove?: boolean;
    forceParkMove?: boolean;
    forceMoveEveryNight?: boolean;
    forceParkMoveEveryNight?: boolean;
    requireUniqueSites?: boolean;
    requireUniqueParks?: boolean;
  } = {},
) {
  const candidateCap = options.forceParkMoveEveryNight ? 100 : 160;
  const candidatesByNight = dates.map((night, index) => {
    const candidates = rows
      .filter((row) => row.matchedNights.includes(night))
      .sort((a, b) => {
        if (seed && index === 0) {
          if (a.site.id === seed.site.id && b.site.id !== seed.site.id) return -1;
          if (b.site.id === seed.site.id && a.site.id !== seed.site.id) return 1;
        }
        return sortCandidates(a, b, index > 0 ? undefined : seed);
      });
    return seed && index === 0
      ? candidates.filter((row) => row.site.id === seed.site.id).slice(0, 1)
      : candidates.slice(0, candidateCap);
  });

  const chosen: Array<{ row: PreparedRow; night: string }> = [];
  const usedSites = new Set<string>();
  const usedParks = new Set<string>();

  function canFinishFrom(startIndex: number) {
    for (let i = startIndex; i < dates.length; i += 1) {
      if (
        !candidatesByNight[i].some((row) => {
          const previous = chosen[chosen.length - 1]?.row;
          if (previous && options.forceMoveEveryNight && row.site.id === previous.site.id) return false;
          if (previous && options.forceParkMoveEveryNight && row.park.slug === previous.park.slug) return false;
          if (options.requireUniqueSites && usedSites.has(row.site.id)) return false;
          if (options.requireUniqueParks && usedParks.has(row.park.slug)) return false;
          return true;
        })
      ) {
        return false;
      }
    }
    return true;
  }

  function choose(index: number): boolean {
    if (index >= dates.length) return true;
    const previous = chosen[chosen.length - 1]?.row;
    const candidates = candidatesByNight[index]
      .filter((row) => {
        if (previous && options.forceMoveEveryNight && row.site.id === previous.site.id) return false;
        if (previous && options.forceParkMoveEveryNight && row.park.slug === previous.park.slug) return false;
        if (options.requireUniqueSites && usedSites.has(row.site.id)) return false;
        if (options.requireUniqueParks && usedParks.has(row.park.slug)) return false;
        return true;
      })
      .sort((a, b) => sortCandidates(a, b, previous));

    for (const row of candidates) {
      chosen.push({ row, night: dates[index] });
      usedSites.add(row.site.id);
      usedParks.add(row.park.slug);
      if (canFinishFrom(index + 1) && choose(index + 1)) return true;
      chosen.pop();
      usedSites.delete(row.site.id);
      usedParks.delete(row.park.slug);
    }

    return false;
  }

  if (!choose(0)) return null;

  const segments: SearchResultSegment[] = [];
  for (const item of chosen) {
    const current = segments[segments.length - 1];
    if (current && current.site.id === item.row.site.id && current.park.slug === item.row.park.slug) {
      current.availability.nights.push(item.night);
      continue;
    }
    segments.push(buildSegment(item.row, [item.night], params));
  }

  const first = segments[0];
  if (!first) return null;
  const parkCount = distinctCount(segments.map((segment) => segment.park.slug));
  const moveCount = Math.max(0, segments.length - 1);
  const changedPark = parkCount > 1;
  if (options.forceMove && moveCount === 0) return null;
  if (options.forceMoveEveryNight && segments.length !== dates.length) return null;
  if (options.forceParkMove && !changedPark) return null;
  if (
    options.forceParkMoveEveryNight &&
    segments.some((segment, index) => index > 0 && segment.park.slug === segments[index - 1].park.slug)
  ) {
    return null;
  }
  if (options.requireUniqueSites && distinctCount(segments.map((segment) => segment.site.id)) !== dates.length) return null;
  if (options.requireUniqueParks && parkCount !== dates.length) return null;

  const routeHopKm = segments.reduce((sum, segment, index) => {
    const previousSegment = segments[index - 1];
    if (!previousSegment) return sum;
    return sum + haversineKm(previousSegment.park.location, segment.park.location);
  }, 0);
  const endDistanceKm =
    params.end_lat != null && params.end_lng != null
      ? haversineKm(segments[segments.length - 1].park.location, { lat: params.end_lat, lng: params.end_lng })
      : undefined;
  const routeDistanceKm = (first.park.distance_km ?? 0) + routeHopKm + (endDistanceKm ?? 0);

  return {
    ...first,
    availability: {
      ...first.availability,
      nights: dates,
      last_checked_at: chosen
        .map((item) => item.row.lastChecked)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? first.availability.last_checked_at,
    },
    stay: {
      mode,
      label: stayLabel(mode, moveCount, parkCount),
      move_count: moveCount,
      park_count: parkCount,
      segment_count: segments.length,
      route_distance_km: Math.round(routeDistanceKm * 10) / 10,
      end_distance_km: endDistanceKm != null ? Math.round(endDistanceKm * 10) / 10 : undefined,
      segments,
    },
  } satisfies SearchResult;
}

function itinerarySignature(result: SearchResult): string {
  return (result.stay?.segments ?? [result])
    .map((segment) => `${segment.park.slug}:${segment.site.id}:${segment.availability.nights.join("|")}`)
    .join(">");
}

function resultSegments(result: SearchResult): SearchResultSegment[] {
  return result.stay?.segments ?? [result];
}

type RecommendationStats = {
  parkResultCounts: Map<string, number>;
  operatorResultCounts: Map<string, number>;
  newestCheckedAt: number;
};

function buildRecommendationStats(results: SearchResult[]): RecommendationStats {
  const parkResultCounts = new Map<string, number>();
  const operatorResultCounts = new Map<string, number>();
  let newestCheckedAt = 0;

  for (const result of results) {
    parkResultCounts.set(result.park.slug, (parkResultCounts.get(result.park.slug) ?? 0) + 1);
    operatorResultCounts.set(result.park.operator_id, (operatorResultCounts.get(result.park.operator_id) ?? 0) + 1);
    newestCheckedAt = Math.max(newestCheckedAt, new Date(result.availability.last_checked_at).getTime());
  }

  return { parkResultCounts, operatorResultCounts, newestCheckedAt };
}

function recommendedScore(result: SearchResult, params: SearchParams, stats: RecommendationStats): number {
  const routeKm = result.stay?.route_distance_km ?? result.park.distance_km;
  const radiusKm = Math.max(25, params.radius_km ?? 250);
  const distancePenalty = routeKm != null ? Math.min(routeKm / radiusKm, 1.4) * 62 : 18;
  const parkMatches = stats.parkResultCounts.get(result.park.slug) ?? 1;
  const operatorMatches = stats.operatorResultCounts.get(result.park.operator_id) ?? 1;
  const availabilityBonus = Math.min(34, Math.log1p(parkMatches) * 6.5);
  const operatorDepthBonus = Math.min(10, Math.log1p(operatorMatches) * 1.5);
  const nightBonus = Math.min(12, result.availability.nights.length * 3);
  const movesPenalty = (result.stay?.move_count ?? 0) * 2.5;
  const checkedAt = new Date(result.availability.last_checked_at).getTime();
  const freshnessPenalty =
    stats.newestCheckedAt > 0 && Number.isFinite(checkedAt)
      ? Math.min(8, Math.max(0, stats.newestCheckedAt - checkedAt) / 3_600_000)
      : 0;

  return distancePenalty + movesPenalty + freshnessPenalty - availabilityBonus - operatorDepthBonus - nightBonus;
}

function diversifyRecommendedGroups(groups: SearchResultGroup[]): SearchResultGroup[] {
  const remaining = [...groups];
  const output: SearchResultGroup[] = [];

  while (remaining.length > 0) {
    const recentOperators = new Set(output.slice(-2).map((group) => group.results[0]?.park.operator_id).filter(Boolean));
    const candidateIndex = remaining.findIndex((group, index) => {
      if (index > 6) return false;
      const operatorId = group.results[0]?.park.operator_id;
      return operatorId ? !recentOperators.has(operatorId) : true;
    });
    const index = candidateIndex > 0 ? candidateIndex : 0;
    output.push(remaining.splice(index, 1)[0]);
  }

  return output;
}

function groupSearchResults(
  results: SearchResult[],
  groupBy: SearchGroupMode,
  resultLimit: number,
  sortKey: SearchSortMode,
  params: SearchParams,
  stats: RecommendationStats,
): SearchResultGroup[] {
  const groups = new Map<string, SearchResultGroup>();

  for (const result of results) {
    let key = "all";
    let label = "All results";
    let detail = "Ungrouped campsite matches";
    if (groupBy === "park") {
      const parks = Array.from(new Set(resultSegments(result).map((segment) => segment.park.name)));
      key = result.park.slug;
      label = result.park.name;
      detail = parks.length > 1 ? `${parks.length} parks on route` : `${displayOperatorName(result.park.operator)} / ${result.campground.name}`;
    } else if (groupBy === "campground") {
      key = result.campground.id;
      label = result.campground.name;
      detail = `${result.park.name} / ${displayOperatorName(result.park.operator)}`;
    } else if (groupBy === "operator") {
      key = result.park.operator_id;
      label = displayOperatorName(result.park.operator);
      detail = "Operator network";
    }

    const existing = groups.get(key);
    if (existing) {
      existing.result_count += 1;
      if (existing.results.length < resultLimit) existing.results.push(result);
      if (result.park.distance_km != null) existing.distance = Math.min(existing.distance ?? Infinity, result.park.distance_km);
      existing.hero_image_url ??= result.park.hero_image_url;
    } else {
      groups.set(key, {
        key,
        label,
        detail,
        hero_image_url: groupBy === "park" ? result.park.hero_image_url : null,
        result_count: 1,
        distance: result.park.distance_km,
        results: resultLimit > 0 ? [result] : [],
      });
    }
  }

  const grouped = Array.from(groups.values());
  if (sortKey !== "recommended") return grouped;

  const sorted = grouped.sort((a, b) => {
    const aFirst = a.results[0];
    const bFirst = b.results[0];
    if (!aFirst || !bFirst) return a.label.localeCompare(b.label);
    return recommendedScore(aFirst, params, stats) - recommendedScore(bFirst, params, stats)
      || (b.result_count - a.result_count)
      || a.label.localeCompare(b.label);
  });

  return diversifyRecommendedGroups(sorted);
}

export async function runSearch(params: SearchParams): Promise<SearchResponse> {
  const client = sql();
  const wantDates = params.start_date && params.end_date
    ? eachDate(params.start_date, params.end_date)
    : null;
  const stayMode = params.stay_mode ?? "same_site";
  if (params.start_date && params.end_date && (!wantDates || wantDates.length === 0)) {
    return emptySearchResponse();
  }
  if (!wantDates && stayMode !== "same_site") {
    return emptySearchResponse();
  }
  const allowMoves = stayMode !== "same_site";
  const minNights = Math.max(allowMoves ? 2 : 1, params.min_nights ?? (wantDates ? wantDates.length : 1));
  if (allowMoves && wantDates && wantDates.length < 2) {
    return emptySearchResponse();
  }
  const flexible = params.flexible === true;
  const requiredMatches = allowMoves ? 1 : minNights;
  const radiusM = (params.radius_km ?? Infinity) * 1000;
  const lat = params.lat;
  const lng = params.lng;
  const hasAnchor = lat != null && lng != null;
  const parkSlugs = params.park_slugs?.filter(Boolean) ?? [];

  // Postgres-js tagged template doesn't compose multiple WHERE fragments
  // gracefully — we build them with `client.unsafe` would defeat the purpose.
  // Instead we use parameterized SQL with optional CASE-like conditions.

  const rows = await client<SearchRow[]>`
    WITH filtered_availability AS MATERIALIZED (
      SELECT site_id, night_date, last_checked_at
      FROM site_availability
      WHERE status = 'available'
        ${wantDates
          ? client`AND night_date = ANY(${wantDates}::date[])`
          : client`AND night_date = (now() AT TIME ZONE 'America/Toronto')::date`}
    ),
    matching AS (
      SELECT
        p.id   AS park_id,
        p.slug AS park_slug,
        p.name AS park_name,
        p.lat  AS park_lat,
        p.lng  AS park_lng,
        p.operator_id,
        o.name AS operator_name,
        p.vendor_url,
        p.hero_image_url AS park_hero_image_url,
        s.id  AS site_id,
        s.name AS site_name,
        s.site_type,
        s.site_type_label,
        s.max_equipment_length_ft AS site_max_equipment_length_ft,
        s.amenities AS site_amenities,
        s.rule_summary AS site_rule_summary,
        s.allowed_equipment AS site_allowed_equipment,
        s.has_electric AS site_has_electric,
        s.has_water AS site_has_water,
        s.has_sewer AS site_has_sewer,
        s.is_pull_through AS site_is_pull_through,
        s.is_accessible AS site_is_accessible,
        s.is_pet_friendly AS site_is_pet_friendly,
        s.is_waterfront AS site_is_waterfront,
        s.photos AS site_photos,
        s.campground_id,
        c.name AS campground_name,
        array_agg(fa.night_date ORDER BY fa.night_date) AS matched_nights,
        max(fa.last_checked_at) AS last_checked_at,
        ${hasAnchor
          ? client`min(ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography))`
          : client`NULL::float`}                                              AS distance_m
      FROM filtered_availability fa
      JOIN sites s       ON s.id = fa.site_id
      JOIN campgrounds c ON c.id = s.campground_id
      JOIN parks p       ON p.id = c.park_id
      JOIN operators o   ON o.id = p.operator_id
      WHERE 1=1
        ${hasAnchor && radiusM !== Infinity && parkSlugs.length === 0
          ? client`AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM})`
          : client``}
        ${parkSlugs.length > 0 ? client`AND p.slug = ANY(${parkSlugs})` : client``}
        ${params.operators && params.operators.length > 0 ? client`AND p.operator_id = ANY(${params.operators})` : client``}
        ${params.party_size && params.party_size > 0 ? client`AND s.max_party_size >= ${params.party_size}` : client``}
        ${params.site_types && params.site_types.length > 0 ? client`AND s.site_type = ANY(${params.site_types})` : client``}
        AND NOT (concat_ws(' ', s.name, s.site_type_label, s.site_type, s.description) ~* ${SEASONAL_SITE_LABEL_PATTERN})
        ${params.equipment === "tent"
          ? client`AND COALESCE((s.rule_summary->'policies'->>'noTents')::boolean, false) IS NOT TRUE`
          : client``}
      GROUP BY
        p.id,
        p.slug,
        p.name,
        p.lat,
        p.lng,
        p.operator_id,
        o.name,
        p.vendor_url,
        p.hero_image_url,
        s.id,
        s.name,
        s.site_type,
        s.site_type_label,
        s.max_equipment_length_ft,
        s.amenities,
        s.rule_summary,
        s.allowed_equipment,
        s.has_electric,
        s.has_water,
        s.has_sewer,
        s.is_pull_through,
        s.is_accessible,
        s.is_pet_friendly,
        s.is_waterfront,
        s.photos,
        s.campground_id,
        c.name
      HAVING count(fa.night_date) >= ${requiredMatches}
    )
    SELECT * FROM matching
  `;

  const freshnessSamples: number[] = [];
  const preparedRows: PreparedRow[] = [];
  for (const row of rows) {
    if (!supportsRequestedEquipmentLength(row, params.equipment_length_ft)) continue;
    const prepared = prepareRow(row, params);
    if (params.amenities && params.amenities.length > 0) {
      let ok = true;
      for (const code of params.amenities) {
        if (!prepared.site.amenities.includes(code)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }
    freshnessSamples.push((Date.now() - new Date(prepared.lastChecked).getTime()) / 60000);
    preparedRows.push(prepared);
  }

  let results: SearchResult[] = [];
  if (!wantDates || stayMode === "same_site") {
    for (const row of preparedRows) {
      const nights = wantDates
        ? flexible
          ? row.matchedNights.slice(0, minNights)
          : wantDates
        : row.matchedNights.slice(0, 7);
      if (wantDates && flexible && nights.length < minNights) continue;
      if (wantDates && !flexible && !nights.every((night) => row.matchedNights.includes(night))) continue;
      results.push(buildSingleResult(row, nights, params));
    }
  } else if (stayMode === "same_park") {
    const byPark = new Map<string, PreparedRow[]>();
    for (const row of preparedRows) {
      byPark.set(row.park.slug, [...(byPark.get(row.park.slug) ?? []), row]);
    }
    for (const parkRows of byPark.values()) {
      const dates = chooseDates(parkRows, wantDates, flexible, minNights);
      if (!dates) continue;
      const itinerary = buildItinerary(parkRows, dates, params, "same_park", undefined, {
        forceMove: true,
        forceMoveEveryNight: true,
        requireUniqueSites: true,
      });
      if (itinerary) results.push(itinerary);
    }
  } else {
    const dates = chooseDates(preparedRows, wantDates, flexible, minNights);
    if (dates) {
      const firstNightRows = preparedRows
        .filter((row) => row.matchedNights.includes(dates[0]))
        .sort((a, b) => sortCandidates(a, b))
        .slice(0, 40);
      const seen = new Set<string>();
      for (const seed of firstNightRows) {
        const itinerary = buildItinerary(preparedRows, dates, params, "anywhere", seed, {
          forceMove: true,
          forceMoveEveryNight: true,
          forceParkMoveEveryNight: true,
          requireUniqueSites: true,
        });
        if (!itinerary) continue;
        const signature = itinerarySignature(itinerary);
        if (seen.has(signature)) continue;
        seen.add(signature);
        results.push(itinerary);
      }
    }
  }

  const sortKey = params.sort ?? "recommended";
  const recommendationStats = buildRecommendationStats(results);
  const routeMetric = (result: SearchResult) => result.stay?.route_distance_km ?? result.park.distance_km ?? Number.POSITIVE_INFINITY;
  results.sort((a, b) => {
    const aMoves = a.stay?.move_count ?? 0;
    const bMoves = b.stay?.move_count ?? 0;
    const aParks = a.stay?.park_count ?? 1;
    const bParks = b.stay?.park_count ?? 1;
    if (sortKey === "recommended") {
      return recommendedScore(a, params, recommendationStats) - recommendedScore(b, params, recommendationStats)
        || aParks - bParks
        || aMoves - bMoves
        || a.park.name.localeCompare(b.park.name);
    }
    if (sortKey === "distance" && a.park.distance_km != null && b.park.distance_km != null) {
      return a.park.distance_km - b.park.distance_km || aParks - bParks || aMoves - bMoves;
    }
    if (sortKey === "freshness") {
      return new Date(b.availability.last_checked_at).getTime() - new Date(a.availability.last_checked_at).getTime()
        || aParks - bParks
        || aMoves - bMoves;
    }
    if (sortKey === "route") return routeMetric(a) - routeMetric(b) || aMoves - bMoves || a.park.name.localeCompare(b.park.name);
    if (sortKey === "moves") return aMoves - bMoves || routeMetric(a) - routeMetric(b);
    if (sortKey === "availability") return b.availability.nights.length - a.availability.nights.length || routeMetric(a) - routeMetric(b);
    if (sortKey === "name") return a.park.name.localeCompare(b.park.name);
    if (sortKey === "price") return (a.availability.price_cents ?? 0) - (b.availability.price_cents ?? 0);
    return aParks - bParks || aMoves - bMoves;
  });

  freshnessSamples.sort((a, b) => a - b);
  const p50 = freshnessSamples.length ? freshnessSamples[Math.floor(freshnessSamples.length / 2)] : 0;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? DEFAULT_LIMIT;
  const groupBy = params.group_by;

  if (groupBy && groupBy !== "none") {
    const groupOffset = Math.max(0, params.group_offset ?? 0);
    const groupLimit = Math.max(1, params.group_limit ?? 10);
    const groupResultLimit = Math.max(1, params.group_result_limit ?? 60);
    const groups = groupSearchResults(results, groupBy, groupResultLimit, sortKey, params, recommendationStats);
    const visibleGroups = groups.slice(groupOffset, groupOffset + groupLimit);

    return {
      results: visibleGroups.flatMap((group) => group.results),
      total: results.length,
      group_total: groups.length,
      groups: visibleGroups,
      freshness_p50_minutes: Math.round(p50),
    };
  }

  return {
    results: results.slice(offset, offset + limit),
    total: results.length,
    freshness_p50_minutes: Math.round(p50),
  };
}

export async function operatorHealth(): Promise<
  Array<{ operator: Operator; sites_indexed: number; available_sites: number; median_freshness_minutes: number }>
> {
  const rows = await sql()<Array<{
    id: string; name: string; vendor: string; base_url: string; booking_url: string;
    active: boolean; total_sites: number; available_sites: number;
    median_freshness_minutes: number | null;
  }>>`
    WITH site_freshness AS (
      SELECT p.operator_id,
             s.id AS site_id,
             max(sa.last_checked_at) AS last_checked_at
        FROM sites s
        JOIN campgrounds c ON c.id = s.campground_id
        JOIN parks p ON p.id = c.park_id
        LEFT JOIN site_availability sa
               ON sa.site_id = s.id
              AND sa.night_date = CURRENT_DATE
       GROUP BY p.operator_id, s.id
    ),
    operator_freshness AS (
      SELECT operator_id,
             round((
               percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (now() - last_checked_at)) / 60
               ) FILTER (WHERE last_checked_at IS NOT NULL)
             )::numeric)::int AS median_freshness_minutes
        FROM site_freshness
       GROUP BY operator_id
    )
    SELECT id, name, vendor, base_url, booking_url, active,
           total_sites, available_sites,
           COALESCE(ofr.median_freshness_minutes, 0) AS median_freshness_minutes
      FROM operators o
      LEFT JOIN operator_freshness ofr ON ofr.operator_id = o.id
     ORDER BY name
  `;
  return rows.map((r) => {
    return {
      operator: {
        id: r.id, name: r.name, vendor: r.vendor as Operator["vendor"],
        base_url: r.base_url, booking_url: r.booking_url, active: r.active,
      },
      sites_indexed: r.total_sites,
      available_sites: r.available_sites,
      median_freshness_minutes: r.median_freshness_minutes ?? 0,
    };
  });
}
