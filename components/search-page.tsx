"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { PRESET_LOCATIONS } from "@/lib/locations";
import {
  fetchPlaceSuggestions,
  localLocationSuggestions,
  mergeLocationSuggestions,
  resolvePresetLocation,
  scoreParkLookup,
  type LocationSuggestion,
} from "@/lib/location-suggestions";
import { appDate } from "@/lib/app-time";
import { AMENITIES, type SearchResponse, type SearchResult, type SearchResultGroup } from "@/lib/types";
import { displayOperatorName } from "@/lib/display";
import { imageProxyUrl } from "@/lib/image-proxy";
import { PARK_TYPE_OPTIONS } from "@/lib/park-types";
import { ResultCard } from "@/components/result-card";
import { OntarioMap, type Park as MapPark } from "@/components/ontario-map";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Home,
  List,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  Route,
  RotateCcw,
  Ruler,
  Search,
  Sliders,
  Tent,
  Truck,
  X,
} from "lucide-react";
import { SEARCH_EQUIPMENT_OPTIONS, searchEquipmentById } from "@/lib/search-equipment";
import {
  DEFAULT_SEARCH_RADIUS_KM,
  MAX_SEARCH_RADIUS_KM,
  MIN_SEARCH_RADIUS_KM,
  normalizeSearchRadiusKm,
} from "@/lib/search-radius";
import { SiteDetailFlyout, type SiteFlyoutDetails } from "@/components/site-detail-flyout";
import { ItineraryFlyout } from "@/components/itinerary-flyout";

type ParkSummary = Omit<MapPark, "description" | "hero_image_url">;

const SITE_TYPES = ["tent", "rv", "cabin", "yurt", "backcountry"] as const;
const STAY_MODES = ["same_site", "same_park", "anywhere"] as const;
const VIEW_MODES = ["list", "map"] as const;
const GROUP_OPTIONS = ["park", "campground", "operator", "none"] as const;
const PARK_TYPE_IDS = PARK_TYPE_OPTIONS.map((option) => option.id);
const SORT_OPTIONS = ["recommended", "distance", "route", "moves", "availability", "freshness", "name", "price"] as const;
const RAW_RESULTS_PER_PAGE = 60;
const GROUPS_PER_PAGE = 10;
const RESULTS_PER_GROUP = 60;
const MAP_GROUPS_PER_PAGE = 5;
const INITIAL_GROUP_RESULTS = 8;
const GROUP_RESULTS_INCREMENT = 8;

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
  recommended: "Recommended",
  distance: "Distance from you",
  route: "Route fit",
  moves: "Fewest moves",
  availability: "Open nights",
  freshness: "Freshness",
  name: "Park name",
  price: "Price",
};

const GROUP_LABELS: Record<(typeof GROUP_OPTIONS)[number], string> = {
  park: "Park",
  campground: "Campground",
  operator: "Operator",
  none: "No grouping",
};

const STAY_MODE_OPTIONS: {
  id: (typeof STAY_MODES)[number];
  label: string;
  detail: string;
}[] = [
  { id: "same_site", label: "Same site", detail: "One campsite for the full stay" },
  { id: "same_park", label: "Same park", detail: "Change sites without changing parks" },
  { id: "anywhere", label: "Nightly route", detail: "Change parks every night" },
];

const EQUIPMENT_ICONS: Record<string, LucideIcon> = {
  any: Navigation,
  tent: Tent,
  small_rv: Truck,
  rv: Truck,
  large_rv: Ruler,
  roofed: Home,
};

/** Match a typed location label against PRESET_LOCATIONS — case-insensitive
 *  exact-or-prefix match on either the key or the display label. Returns the
 *  preset's coords if matched, or null otherwise. */
function resolveNear(input: string): { lat: number; lng: number; label: string } | null {
  return resolvePresetLocation(input);
}

async function geocodeNear(input: string): Promise<LocationSuggestion | null> {
  const query = input.trim();
  if (query.length < 2) return null;
  const suggestions = await fetchPlaceSuggestions(query);
  return suggestions[0] ?? null;
}

function rangeNights(start: string, end: string): number | null {
  if (!start || !end) return null;
  const startTime = new Date(`${start}T00:00:00`).getTime();
  const endTime = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return null;
  return Math.round((endTime - startTime) / 86_400_000);
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeCheckoutDate(startDate: string, endDate: string): string {
  if (!startDate || !Number.isFinite(Date.parse(`${startDate}T00:00:00Z`))) return endDate;
  return !endDate || endDate <= startDate ? addIsoDays(startDate, 1) : endDate;
}

function sameDayCheckInMessage(startDate: string): string | null {
  if (!startDate) return null;
  const minimum = appDate(1);
  if (startDate >= minimum) return null;
  const today = appDate();
  const minimumLabel = formatShortDate(minimum) ?? minimum;
  if (startDate === today) {
    return `Same-day check-in is closed for ${formatShortDate(startDate) ?? startDate}. Choose ${minimumLabel} or later.`;
  }
  return `Check-in must be ${minimumLabel} or later.`;
}

function dateRequirementMessage(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return null;
  const sameDayMessage = sameDayCheckInMessage(startDate);
  if (sameDayMessage) return sameDayMessage;
  if (rangeNights(startDate, endDate) == null) return "Check-out must be after check-in.";
  return null;
}

function clampIntegerInput(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function formatShortDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(date);
}

function stayModeCopy(mode: (typeof STAY_MODES)[number]) {
  return STAY_MODE_OPTIONS.find((option) => option.id === mode) ?? STAY_MODE_OPTIONS[0];
}

function resultSegments(result: SearchResult) {
  return result.stay?.segments ?? [result];
}

function groupResults(results: SearchResult[], groupBy: (typeof GROUP_OPTIONS)[number]) {
  const groups = new Map<string, SearchResultGroup>();

  for (const result of results) {
    let key = "all";
    let label = "All results";
    let detail = "Ungrouped campsite matches";
    if (groupBy === "park") {
      const parks = Array.from(new Set(resultSegments(result).map((segment) => segment.park.name)));
      key = result.park.slug;
      label = result.park.name;
      detail = parks.length > 1 ? `${parks.length} parks on route` : `${displayOperatorName(result.park.operator)} · ${result.campground.name}`;
    } else if (groupBy === "campground") {
      key = result.campground.id;
      label = result.campground.name;
      detail = `${result.park.name} · ${displayOperatorName(result.park.operator)}`;
    } else if (groupBy === "operator") {
      key = result.park.operator_id;
      label = displayOperatorName(result.park.operator);
      detail = "Operator network";
    }

    const existing = groups.get(key);
    if (existing) {
      existing.result_count += 1;
      existing.results.push(result);
      if (result.park.distance_km != null) existing.distance = Math.min(existing.distance ?? Infinity, result.park.distance_km);
      existing.hero_image_url ??= result.park.hero_image_url;
    } else {
      groups.set(key, {
        key,
        label,
        detail,
        hero_image_url: groupBy === "park" ? result.park.hero_image_url : null,
        result_count: 1,
        results: [result],
        distance: result.park.distance_km,
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.distance != null && b.distance != null && a.distance !== b.distance) return a.distance - b.distance;
    return a.label.localeCompare(b.label);
  });
}

export function SearchPage() {
  const [state, setState] = useQueryStates({
    loc: parseAsString.withDefault(""),
    lat: parseAsFloat,
    lng: parseAsFloat,
    end_loc: parseAsString.withDefault(""),
    end_lat: parseAsFloat,
    end_lng: parseAsFloat,
    radius_km: parseAsInteger.withDefault(DEFAULT_SEARCH_RADIUS_KM),
    start_date: parseAsString.withDefault(""),
    end_date: parseAsString.withDefault(""),
    flexible: parseAsBoolean.withDefault(false),
    min_nights: parseAsInteger,
    party_size: parseAsInteger.withDefault(2),
    equipment: parseAsString.withDefault("any"),
    equipment_length_ft: parseAsInteger,
    site_types: parseAsArrayOf(parseAsString).withDefault([]),
    amenities: parseAsArrayOf(parseAsString).withDefault([]),
    operators: parseAsArrayOf(parseAsString).withDefault([]),
    park_types: parseAsArrayOf(parseAsStringLiteral(PARK_TYPE_IDS)).withDefault([]),
    park_slugs: parseAsArrayOf(parseAsString).withDefault([]),
    stay_mode: parseAsStringLiteral(STAY_MODES).withDefault("same_site"),
    view: parseAsStringLiteral(VIEW_MODES).withDefault("list"),
    group_by: parseAsStringLiteral(GROUP_OPTIONS).withDefault("park"),
    sort: parseAsStringLiteral(SORT_OPTIONS).withDefault("recommended"),
    page: parseAsInteger.withDefault(1),
  });

  // Local input state for the "Near" field so the user can type freely without
  // every keystroke triggering a URL update.
  const [nearInput, setNearInput] = useState<string>(() => {
    if (state.loc) {
      const preset = PRESET_LOCATIONS[state.loc];
      return preset?.label ?? state.loc;
    }
    return "";
  });
  const [selectedNearSuggestion, setSelectedNearSuggestion] = useState<LocationSuggestion | null>(null);
  const [nearSuggestions, setNearSuggestions] = useState<LocationSuggestion[]>([]);
  const [nearSuggestionsOpen, setNearSuggestionsOpen] = useState(false);
  const [nearSuggestionsLoading, setNearSuggestionsLoading] = useState(false);
  const [endInput, setEndInput] = useState<string>(() => state.end_loc);
  const [parkInput, setParkInput] = useState("");
  const [radiusInput, setRadiusInput] = useState(() => String(state.radius_km));
  const [partyInput, setPartyInput] = useState(() => String(state.party_size));
  const [minNightsInput, setMinNightsInput] = useState(() => state.min_nights != null ? String(state.min_nights) : "");
  const [minNightsDirty, setMinNightsDirty] = useState(false);

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvingNear, setResolvingNear] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [selectedSiteDetails, setSelectedSiteDetails] = useState<SiteFlyoutDetails | null>(null);
  const [selectedItinerary, setSelectedItinerary] = useState<SearchResult | null>(null);
  const [loadingSiteId, setLoadingSiteId] = useState<string | null>(null);
  const [allParks, setAllParks] = useState<ParkSummary[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [activeMapGroupIndex, setActiveMapGroupIndex] = useState(0);
  const [expandedMapGroup, setExpandedMapGroup] = useState<SearchResultGroup | null>(null);
  const [visibleGroupResultCounts, setVisibleGroupResultCounts] = useState<Record<string, number>>({});
  const [submittedState, setSubmittedState] = useState<typeof state | null>(null);
  const [autoNearParkSlug, setAutoNearParkSlug] = useState<string | null>(null);
  // `searchKey` bumps every time the user explicitly hits Search.
  // The fetch effect depends on it, NOT on filter state — so changing a chip
  // doesn't auto-fire a query.
  const [searchKey, setSearchKey] = useState(0);

  // Kick off shareable /search URLs after hydration. A useState initializer
  // would see no `window` during the server render and miss these params.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (
      sp.has("lat") ||
      sp.has("loc") ||
      sp.has("start_date") ||
      sp.has("end_date") ||
      sp.has("end_lat") ||
      sp.has("end_loc") ||
      sp.has("equipment") ||
      sp.has("stay_mode") ||
      sp.has("park_slugs")
    ) {
      setSearchKey(1);
    }
  }, []);

  useEffect(() => {
    setRadiusInput(String(normalizeSearchRadiusKm(state.radius_km)));
  }, [state.radius_km]);

  useEffect(() => {
    setPartyInput(String(state.party_size));
  }, [state.party_size]);

  useEffect(() => {
    const repairedEndDate = normalizeCheckoutDate(state.start_date, state.end_date);
    if (repairedEndDate !== state.end_date) {
      void setState({ end_date: repairedEndDate, page: 1 });
    }
  }, [setState, state.end_date, state.start_date]);

  // Fetch the full parks rollup once on mount. Used to render every park on
  // the map regardless of the current search filters.
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/parks/summary", { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => setAllParks(d.parks ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const query = nearInput.trim();
    if (selectedNearSuggestion && query === selectedNearSuggestion.label) return;

    const localSuggestions = localLocationSuggestions(query, allParks);
    setNearSuggestions(localSuggestions);

    if (query.length < 2) {
      setNearSuggestionsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setNearSuggestionsLoading(true);
      try {
        const placeSuggestions = await fetchPlaceSuggestions(query, controller.signal);
        setNearSuggestions(mergeLocationSuggestions([...localSuggestions, ...placeSuggestions]).slice(0, 8));
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setNearSuggestions(localSuggestions);
        }
      } finally {
        setNearSuggestionsLoading(false);
      }
    }, 240);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [allParks, nearInput, selectedNearSuggestion]);

  // Resolve lat/lng from the typed "near" string (preset match) or explicit
  // lat/lng params from the URL.
  const effectiveAnchor = useMemo(() => {
    if (state.lat != null && state.lng != null) return { lat: state.lat, lng: state.lng };
    const preset = resolveNear(state.loc);
    return preset ? { lat: preset.lat, lng: preset.lng } : null;
  }, [state.lat, state.lng, state.loc]);

  async function runSearch() {
    // Commit typed place strings into state only when the user runs a search.
    if (!state.start_date || !state.end_date) {
      setLocationMessage(null);
      setLoading(false);
      return;
    }

    const dateMessage = dateRequirementMessage(state.start_date, state.end_date);
    if (dateMessage) {
      setLocationMessage(dateMessage);
      const empty = { results: [], total: 0, group_total: 0, groups: [], freshness_p50_minutes: 0 };
      setData(empty);
      setLoading(false);
      const nextState = { ...state, page: 1 } as typeof state;
      setSubmittedState(nextState);
      await setState({ page: 1 });
      return;
    }

    const committedPartySize = clampIntegerInput(partyInput, 1, 12, state.party_size || 2);
    const effectiveMinNightsForSearch = Math.max(
      minRouteNights,
      Math.min(state.min_nights ?? dateWindowNights ?? minRouteNights, dateWindowNights ?? 21),
    );
    const shouldCommitMinNights = minNightsDirty || state.flexible;
    const committedMinNights = shouldCommitMinNights
      ? clampIntegerInput(
        minNightsInput,
        minRouteNights,
        dateWindowNights ?? 21,
        effectiveMinNightsForSearch,
      )
      : state.min_nights;

    setPartyInput(String(committedPartySize));
    if (shouldCommitMinNights && committedMinNights != null) {
      setMinNightsInput(String(committedMinNights));
      setMinNightsDirty(false);
    }

    const query = nearInput.trim();
    const committedRadius = normalizeSearchRadiusKm(radiusInput);
    setRadiusInput(String(committedRadius));
    const nextState: Partial<typeof state> = { page: 1, radius_km: committedRadius, party_size: committedPartySize };
    if (shouldCommitMinNights && committedMinNights != null) {
      nextState.flexible = true;
      nextState.min_nights = committedMinNights;
    }
    let nextAutoNearParkSlug: string | null = autoNearParkSlug;
    setLocationMessage(null);

    if (query.toLowerCase() === "current location" && state.lat != null && state.lng != null) {
      nextState.loc = "Current location";
      if (autoNearParkSlug) {
        nextState.park_slugs = state.park_slugs.filter((slug) => slug !== autoNearParkSlug);
        nextAutoNearParkSlug = null;
      }
    } else if (query) {
      const selectedNear = selectedNearSuggestion && query === selectedNearSuggestion.label
        ? selectedNearSuggestion
        : null;
      if (selectedNear?.source === "park" && selectedNear.slug) {
        nextState.loc = selectedNear.label;
        nextState.lat = selectedNear.lat;
        nextState.lng = selectedNear.lng;
        nextState.park_slugs = [selectedNear.slug];
        nextAutoNearParkSlug = selectedNear.slug;
      } else if (selectedNear) {
        nextState.loc = selectedNear.label;
        nextState.lat = selectedNear.lat;
        nextState.lng = selectedNear.lng;
        if (autoNearParkSlug) {
          nextState.park_slugs = state.park_slugs.filter((slug) => slug !== autoNearParkSlug);
          nextAutoNearParkSlug = null;
        }
      } else {
        const preset = resolveNear(query);
        if (preset) {
          const key = Object.entries(PRESET_LOCATIONS).find(([, p]) => p.label === preset.label)?.[0]
            ?? query.toLowerCase();
          nextState.loc = key;
          nextState.lat = null;
          nextState.lng = null;
          if (autoNearParkSlug) {
            nextState.park_slugs = state.park_slugs.filter((slug) => slug !== autoNearParkSlug);
            nextAutoNearParkSlug = null;
          }
        } else {
          const parkMatch = allParks
            .map((park) => ({ park, score: scoreParkLookup(query, park) }))
            .filter((match) => match.score >= 80)
            .sort((a, b) => b.score - a.score || b.park.available_sites - a.park.available_sites || a.park.name.localeCompare(b.park.name))[0]?.park;
          if (parkMatch) {
            setNearInput(parkMatch.name);
            nextState.loc = parkMatch.name;
            nextState.lat = parkMatch.lat;
            nextState.lng = parkMatch.lng;
            nextState.park_slugs = [parkMatch.slug];
            nextAutoNearParkSlug = parkMatch.slug;
          } else {
            if (autoNearParkSlug) {
              nextState.park_slugs = state.park_slugs.filter((slug) => slug !== autoNearParkSlug);
              nextAutoNearParkSlug = null;
            }
            setResolvingNear(true);
            let place: LocationSuggestion | null = null;
            try {
              place = await geocodeNear(query);
            } catch {
              place = null;
            } finally {
              setResolvingNear(false);
            }
            if (place) {
              setNearInput(place.label);
              nextState.loc = place.label;
              nextState.lat = place.lat;
              nextState.lng = place.lng;
            } else {
              nextState.loc = query;
              nextState.lat = null;
              nextState.lng = null;
              setLocationMessage("Showing Ontario-wide results until this place can be resolved.");
            }
          }
        }
      }
    } else {
      nextState.loc = "";
      nextState.lat = null;
      nextState.lng = null;
      if (autoNearParkSlug) {
        nextState.park_slugs = state.park_slugs.filter((slug) => slug !== autoNearParkSlug);
        nextAutoNearParkSlug = null;
      }
    }

    if (state.stay_mode === "anywhere") {
      const endQuery = endInput.trim();
      if (endQuery) {
        const endPreset = resolveNear(endQuery);
        if (endPreset) {
          nextState.end_loc = endPreset.label;
          nextState.end_lat = endPreset.lat;
          nextState.end_lng = endPreset.lng;
          setEndInput(endPreset.label);
        } else {
          setResolvingNear(true);
          let endPlace: LocationSuggestion | null = null;
          try {
            endPlace = await geocodeNear(endQuery);
          } catch {
            endPlace = null;
          } finally {
            setResolvingNear(false);
          }
          if (endPlace) {
            nextState.end_loc = endPlace.label;
            nextState.end_lat = endPlace.lat;
            nextState.end_lng = endPlace.lng;
            setEndInput(endPlace.label);
          } else {
            nextState.end_loc = endQuery;
            nextState.end_lat = null;
            nextState.end_lng = null;
            setLocationMessage("End point was not resolved; ranking routes from the starting location only.");
          }
        }
      } else {
        nextState.end_loc = "";
        nextState.end_lat = null;
        nextState.end_lng = null;
      }
    }

    if (state.stay_mode === "anywhere" && (nextState.end_lat != null || state.end_lat != null) && state.sort === "distance") {
      nextState.sort = "route";
    }
    const committedState = { ...state, ...nextState } as typeof state;
    setAutoNearParkSlug(nextAutoNearParkSlug);
    setSubmittedState(committedState);
    try {
      await setState(nextState);
    } finally {
      setSearchKey((k) => k + 1);
    }
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("Location is unavailable in this browser.");
      return;
    }

    setResolvingNear(true);
    setLocationMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNearInput("Current location");
        const parkSlugs = autoNearParkSlug
          ? state.park_slugs.filter((slug) => slug !== autoNearParkSlug)
          : state.park_slugs;
        setAutoNearParkSlug(null);
        setState({
          loc: "Current location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          park_slugs: parkSlugs,
        });
        setResolvingNear(false);
      },
      () => {
        setResolvingNear(false);
        setLocationMessage("Location permission was not granted.");
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60 * 1000 },
    );
  }

  function selectNearSuggestion(suggestion: LocationSuggestion) {
    setSelectedNearSuggestion(suggestion);
    setNearInput(suggestion.label);
    setNearSuggestions([]);
    setNearSuggestionsOpen(false);
    setLocationMessage(null);

    if (suggestion.source === "park" && suggestion.slug) {
      setAutoNearParkSlug(suggestion.slug);
      setState({
        loc: suggestion.label,
        lat: suggestion.lat,
        lng: suggestion.lng,
        park_slugs: [suggestion.slug],
        page: 1,
      });
      return;
    }

    const nextParkSlugs = autoNearParkSlug
      ? state.park_slugs.filter((slug) => slug !== autoNearParkSlug)
      : state.park_slugs;
    if (autoNearParkSlug) setAutoNearParkSlug(null);
    setState({
      loc: suggestion.label,
      lat: suggestion.lat,
      lng: suggestion.lng,
      park_slugs: nextParkSlugs,
      page: 1,
    });
  }

  // Fetch when searchKey changes. We use the submitted snapshot so the request
  // cannot race behind URL/query-state commits.
  useEffect(() => {
    if (searchKey === 0) return;
    const requestState = submittedState ?? state;
    if (!requestState.start_date || !requestState.end_date) {
      setLocationMessage(null);
      setLoading(false);
      return;
    }

    const dateMessage = dateRequirementMessage(requestState.start_date, requestState.end_date);
    if (dateMessage) {
      setLocationMessage(dateMessage);
      setData({ results: [], total: 0, group_total: 0, groups: [], freshness_p50_minutes: 0 });
      setLoading(false);
      return;
    }

    const requestAnchor =
      requestState.lat != null && requestState.lng != null
        ? { lat: requestState.lat, lng: requestState.lng }
        : resolveNear(requestState.loc);
    const searchNights = rangeNights(requestState.start_date, requestState.end_date);
    if (requestState.stay_mode !== "same_site" && (!searchNights || searchNights < 2)) {
      setData({ results: [], total: 0, group_total: 0, groups: [], freshness_p50_minutes: 0 });
      setLoading(false);
      return;
    }
    const sp = new URLSearchParams();
    if (requestAnchor) {
      sp.set("lat", String(requestAnchor.lat));
      sp.set("lng", String(requestAnchor.lng));
    }
    if (requestState.stay_mode === "anywhere" && requestState.end_lat != null && requestState.end_lng != null) {
      sp.set("end_lat", String(requestState.end_lat));
      sp.set("end_lng", String(requestState.end_lng));
    }
    sp.set("radius_km", String(normalizeSearchRadiusKm(requestState.radius_km)));
    if (requestState.start_date) sp.set("start_date", requestState.start_date);
    if (requestState.end_date) sp.set("end_date", requestState.end_date);
    if (requestState.flexible) sp.set("flexible", "true");
    if (requestState.min_nights) sp.set("min_nights", String(requestState.min_nights));
    if (requestState.party_size) sp.set("party_size", String(requestState.party_size));
    if (requestState.equipment && requestState.equipment !== "any") sp.set("equipment", requestState.equipment);
    if (requestState.equipment_length_ft) sp.set("equipment_length_ft", String(requestState.equipment_length_ft));
    if (requestState.site_types.length) sp.set("site_types", requestState.site_types.join(","));
    if (requestState.amenities.length) sp.set("amenities", requestState.amenities.join(","));
    if (requestState.operators.length) sp.set("operators", requestState.operators.join(","));
    if (requestState.park_types.length) sp.set("park_types", requestState.park_types.join(","));
    if (requestState.park_slugs.length) sp.set("park_slugs", requestState.park_slugs.join(","));
    sp.set("stay_mode", requestState.stay_mode);
    sp.set("sort", requestState.sort);
    if (requestState.group_by === "none") {
      sp.set("group_by", "none");
      sp.set("limit", String(RAW_RESULTS_PER_PAGE));
      sp.set("offset", String((Math.max(1, requestState.page) - 1) * RAW_RESULTS_PER_PAGE));
    } else {
      sp.set("group_by", requestState.group_by);
      sp.set("group_limit", String(GROUPS_PER_PAGE));
      sp.set("group_offset", String((Math.max(1, requestState.page) - 1) * GROUPS_PER_PAGE));
      sp.set("group_result_limit", String(RESULTS_PER_GROUP));
    }

    setLoading(true);
    const ac = new AbortController();
    fetch(`/api/search?${sp.toString()}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  function toggle<T extends string>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  function applyEquipment(id: string) {
    const option = searchEquipmentById(id);
    setState({
      equipment: option.id,
      equipment_length_ft: option.equipmentLengthFt ?? null,
      site_types: option.siteTypes,
      page: 1,
    });
  }

  function updateStartDate(nextStartDate: string) {
    setState({
      start_date: nextStartDate,
      end_date: normalizeCheckoutDate(nextStartDate, state.end_date),
      page: 1,
    });
  }

  function updateEndDate(nextEndDate: string) {
    setState({
      end_date: normalizeCheckoutDate(state.start_date, nextEndDate),
      page: 1,
    });
  }

  function addParkFilter(park: ParkSummary) {
    if (state.park_slugs.includes(park.slug)) return;
    setAutoNearParkSlug(null);
    setState({ park_slugs: [...state.park_slugs, park.slug], page: 1 });
    setParkInput("");
  }

  function removeParkFilter(slug: string) {
    if (autoNearParkSlug === slug) setAutoNearParkSlug(null);
    setState({ park_slugs: state.park_slugs.filter((item) => item !== slug), page: 1 });
  }

  async function updateGroupBy(groupBy: typeof state.group_by) {
    await setState({ group_by: groupBy, page: 1 });
    if (data) setSearchKey((k) => k + 1);
  }

  async function updateStayMode(stayMode: typeof state.stay_mode) {
    await setState({
      stay_mode: stayMode,
      page: 1,
      sort: stayMode === "anywhere" && state.sort === "distance" ? "route" : state.sort,
    });
    if (data) setSearchKey((k) => k + 1);
  }

  async function goToPage(page: number) {
    const nextPage = Math.max(1, page);
    setSubmittedState({ ...state, page: nextPage } as typeof state);
    await setState({ page: nextPage });
    setSearchKey((k) => k + 1);
  }

  function setFlexibleDates(next: boolean) {
    const windowNights = rangeNights(state.start_date, state.end_date);
    const minRouteNights = state.stay_mode === "same_site" ? 1 : 2;
    const defaultNights = Math.max(minRouteNights, Math.min(windowNights ?? 2, 2));
    setMinNightsDirty(false);
    setState({
      flexible: next,
      min_nights: next ? (state.min_nights ?? defaultNights) : null,
    });
  }

  async function resetFilters() {
    setEndInput("");
    setParkInput("");
    setRadiusInput(String(DEFAULT_SEARCH_RADIUS_KM));
    setPartyInput("2");
    setMinNightsDirty(false);
    setAutoNearParkSlug(null);
    const nextState = {
      ...state,
      end_loc: "",
      end_lat: null,
      end_lng: null,
      radius_km: DEFAULT_SEARCH_RADIUS_KM,
      flexible: false,
      min_nights: null,
      party_size: 2,
      equipment: "any",
      equipment_length_ft: null,
      site_types: [],
      amenities: [],
      operators: [],
      park_types: [],
      park_slugs: [],
      stay_mode: "same_site",
      group_by: "park",
      sort: "recommended",
      page: 1,
    } as typeof state;
    setSubmittedState(nextState);
    await setState({
      end_loc: nextState.end_loc,
      end_lat: nextState.end_lat,
      end_lng: nextState.end_lng,
      radius_km: nextState.radius_km,
      flexible: nextState.flexible,
      min_nights: nextState.min_nights,
      party_size: nextState.party_size,
      equipment: nextState.equipment,
      equipment_length_ft: nextState.equipment_length_ft,
      site_types: nextState.site_types,
      amenities: nextState.amenities,
      operators: nextState.operators,
      park_types: nextState.park_types,
      park_slugs: nextState.park_slugs,
      stay_mode: nextState.stay_mode,
      group_by: nextState.group_by,
      sort: nextState.sort,
      page: nextState.page,
    });
    if (data) setSearchKey((k) => k + 1);
  }

  function commitRadiusInput(value = radiusInput) {
    const normalized = normalizeSearchRadiusKm(value);
    setRadiusInput(String(normalized));
    setState({ radius_km: normalized, page: 1 });
  }

  async function openSiteDetails(siteId: string, bookingUrl?: string) {
    setSelectedItinerary(null);
    setLoadingSiteId(siteId);
    setLocationMessage(null);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/details`);
      if (!response.ok) throw new Error("Failed to load site details");
      const payload = (await response.json()) as { details?: SiteFlyoutDetails };
      if (!payload.details) throw new Error("Missing site details");
      setSelectedSiteDetails({
        ...payload.details,
        bookingUrl: bookingUrl ?? payload.details.bookingUrl,
      });
    } catch {
      setLocationMessage("Site details could not be opened. The park link still works.");
    } finally {
      setLoadingSiteId(null);
    }
  }

  function openResult(result: SearchResult) {
    const segments = result.stay?.segments ?? [result];
    if (segments.length > 1) {
      setSelectedSiteDetails(null);
      setSelectedItinerary(result);
      return;
    }
    openSiteDetails(result.site.id, result.booking_url);
  }

  // Slugs of parks that have at least one site in the current search results.
  const matchedSlugs = useMemo<Set<string> | null>(() => {
    if (!data) return null;
    const s = new Set<string>();
    for (const r of data.results) {
      for (const segment of r.stay?.segments ?? [r]) s.add(segment.park.slug);
    }
    return s;
  }, [data]);

  const selectedEquipment = useMemo(() => searchEquipmentById(state.equipment), [state.equipment]);
  const EquipmentIcon = EQUIPMENT_ICONS[selectedEquipment.id] ?? Navigation;
  const selectedStayMode = stayModeCopy(state.stay_mode);
  const dateWindowNights = rangeNights(state.start_date, state.end_date);
  const minimumCheckInDate = appDate(1);
  const minimumCheckOutDate = addIsoDays(
    state.start_date && state.start_date >= minimumCheckInDate ? state.start_date : minimumCheckInDate,
    1,
  );
  const dateBlockMessage = dateRequirementMessage(state.start_date, state.end_date);
  const datesMissing = !state.start_date || !state.end_date;
  const searchDisabled = loading || resolvingNear || datesMissing || Boolean(dateBlockMessage);
  const selectedParkSet = useMemo(() => new Set(state.park_slugs), [state.park_slugs]);
  const selectedParks = useMemo(
    () =>
      state.park_slugs.map((slug) => {
        const park = allParks.find((item) => item.slug === slug);
        return park ?? {
          slug,
          name: slug.replace(/-\d+$/, "").replaceAll("-", " "),
          operator: "Selected park",
          operator_id: "",
          region: "",
          lat: 0,
          lng: 0,
          total_sites: 0,
          available_sites: 0,
          availability_pct: 0,
        };
      }),
    [allParks, state.park_slugs],
  );
  const mapParks = useMemo<MapPark[]>(
    () => allParks.map((park) => ({ ...park, description: null, hero_image_url: null })),
    [allParks],
  );
  const searchMapParks = useMemo<MapPark[]>(() => {
    if (!data) return mapParks;
    const baseBySlug = new Map(allParks.map((park) => [park.slug, park]));
    const bySlug = new Map<string, MapPark>();

    for (const result of data.results) {
      const seenInResult = new Set<string>();
      for (const segment of result.stay?.segments ?? [result]) {
        if (seenInResult.has(segment.park.slug)) continue;
        seenInResult.add(segment.park.slug);
        const base = baseBySlug.get(segment.park.slug);
        const existing = bySlug.get(segment.park.slug);
        if (existing) {
          existing.match_count = (existing.match_count ?? 0) + 1;
          existing.available_sites = existing.match_count;
          existing.total_sites = Math.max(existing.total_sites, existing.match_count);
          if (segment.park.distance_km != null) {
            existing.distance_km = Math.min(existing.distance_km ?? Infinity, segment.park.distance_km);
          }
          if (!existing.hero_image_url && segment.park.hero_image_url) existing.hero_image_url = segment.park.hero_image_url;
          continue;
        }
        bySlug.set(segment.park.slug, {
          slug: segment.park.slug,
          name: segment.park.name,
          description: null,
          hero_image_url: segment.park.hero_image_url ?? null,
          operator: segment.park.operator,
          operator_id: segment.park.operator_id,
          region: base?.region ?? "",
          lat: base?.lat ?? segment.park.location.lat,
          lng: base?.lng ?? segment.park.location.lng,
          total_sites: Math.max(1, base?.total_sites ?? 1),
          available_sites: 1,
          availability_pct: 100,
          match_count: 1,
          distance_km: segment.park.distance_km,
        });
      }
    }

    return Array.from(bySlug.values()).sort((a, b) => {
      if (a.distance_km != null && b.distance_km != null && a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
      return (b.match_count ?? 0) - (a.match_count ?? 0) || a.name.localeCompare(b.name);
    });
  }, [allParks, data, mapParks]);
  const parkSuggestions = useMemo(() => {
    const query = parkInput.trim().toLowerCase();
    if (!query) return [];
    return allParks
      .filter((park) => {
        if (selectedParkSet.has(park.slug)) return false;
        return `${park.name} ${park.operator} ${park.region}`.toLowerCase().includes(query);
      })
      .sort((a, b) => b.available_sites - a.available_sites || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [allParks, parkInput, selectedParkSet]);
  const advancedFilterCount = state.site_types.length + state.amenities.length;
  const resultWord = state.stay_mode === "same_site" ? "sites" : "routes";
  const groupedMode = state.group_by !== "none";
  const groupedResults = useMemo(
    () => (data?.groups ? data.groups : data ? groupResults(data.results, state.group_by) : []),
    [data, state.group_by],
  );
  const mapParkGroups = useMemo(
    () => (data ? groupResults(data.results, "park") : []),
    [data],
  );
  const clampedActiveMapGroupIndex = mapParkGroups.length
    ? Math.min(activeMapGroupIndex, mapParkGroups.length - 1)
    : 0;
  const activeMapGroup = mapParkGroups[clampedActiveMapGroupIndex] ?? null;
  const activeMapPage = Math.floor(clampedActiveMapGroupIndex / MAP_GROUPS_PER_PAGE);
  const visibleMapParkGroups = mapParkGroups.slice(
    activeMapPage * MAP_GROUPS_PER_PAGE,
    activeMapPage * MAP_GROUPS_PER_PAGE + MAP_GROUPS_PER_PAGE,
  );
  const visibleMapPageStart = mapParkGroups.length ? activeMapPage * MAP_GROUPS_PER_PAGE + 1 : 0;
  const visibleMapPageEnd = Math.min((activeMapPage + 1) * MAP_GROUPS_PER_PAGE, mapParkGroups.length);

  useEffect(() => {
    setActiveMapGroupIndex(0);
    setExpandedMapGroup(null);
    setVisibleGroupResultCounts({});
  }, [data]);

  useEffect(() => {
    if (!expandedMapGroup) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setExpandedMapGroup(null);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [expandedMapGroup]);

  function focusMapPark(slug: string | undefined) {
    if (!slug) return;
    const index = mapParkGroups.findIndex((group) => group.key === slug);
    if (index >= 0) setActiveMapGroupIndex(index);
  }

  function visibleResultCountForGroup(renderKey: string, group: SearchResultGroup) {
    return Math.min(visibleGroupResultCounts[renderKey] ?? INITIAL_GROUP_RESULTS, group.results.length);
  }

  function loadMoreGroupResults(renderKey: string, loadedCount: number) {
    setVisibleGroupResultCounts((current) => {
      const nextCount = Math.min(loadedCount, (current[renderKey] ?? INITIAL_GROUP_RESULTS) + GROUP_RESULTS_INCREMENT);
      return { ...current, [renderKey]: nextCount };
    });
  }

  const expandedMapGroupKey = expandedMapGroup ? `map:${expandedMapGroup.key}` : "";
  const expandedMapVisibleResultCount = expandedMapGroup
    ? visibleResultCountForGroup(expandedMapGroupKey, expandedMapGroup)
    : 0;
  const groupTotal = data?.group_total ?? groupedResults.length;
  const groupUnit = state.group_by === "park" ? "parks" : state.group_by === "campground" ? "campgrounds" : "operators";
  const pageStart = data
    ? groupedMode
      ? Math.min((state.page - 1) * GROUPS_PER_PAGE + 1, groupTotal)
      : Math.min((state.page - 1) * RAW_RESULTS_PER_PAGE + 1, data.total)
    : 0;
  const pageEnd = data
    ? groupedMode
      ? Math.min(state.page * GROUPS_PER_PAGE, groupTotal)
      : Math.min(state.page * RAW_RESULTS_PER_PAGE, data.total)
    : 0;
  const hasPreviousPage = state.page > 1;
  const hasNextPage = data
    ? groupedMode
      ? state.page * GROUPS_PER_PAGE < groupTotal
      : state.page * RAW_RESULTS_PER_PAGE < data.total
    : false;
  const hasRouteEndpoint = state.stay_mode === "anywhere" && state.end_lat != null && state.end_lng != null;
  const routeNeedsDates = state.stay_mode !== "same_site" && (!dateWindowNights || dateWindowNights < 2);
  const minRouteNights = state.stay_mode === "same_site" ? 1 : 2;
  const maxMinNights = dateWindowNights ?? 21;
  const effectiveMinNights = Math.max(
    minRouteNights,
    Math.min(state.min_nights ?? dateWindowNights ?? minRouteNights, maxMinNights),
  );
  const tripOptionCount = (state.stay_mode !== "same_site" ? 1 : 0) + (hasRouteEndpoint ? 1 : 0);
  const planningOptionCount =
    (state.group_by !== "park" ? 1 : 0) +
    (state.sort !== "distance" ? 1 : 0) +
    (normalizeSearchRadiusKm(state.radius_km) !== DEFAULT_SEARCH_RADIUS_KM ? 1 : 0) +
    (state.flexible ? 1 : 0) +
    (state.party_size !== 2 ? 1 : 0);
  const dateSummary = state.start_date && state.end_date
    ? `${formatShortDate(state.start_date) ?? state.start_date}-${formatShortDate(state.end_date) ?? state.end_date}`
    : "Any dates";
  const mobileActiveCount =
    advancedFilterCount +
    selectedParks.length +
    (state.stay_mode !== "same_site" ? 1 : 0) +
    (state.flexible ? 1 : 0) +
    (state.party_size !== 2 ? 1 : 0) +
    (normalizeSearchRadiusKm(state.radius_km) !== DEFAULT_SEARCH_RADIUS_KM ? 1 : 0);
  const mobilePrimarySummary = `${nearInput.trim() || "Ontario"} · ${dateSummary}`;
  const mobileSecondarySummary = [
    selectedEquipment.shortLabel,
    selectedStayMode.label,
    `${normalizeSearchRadiusKm(state.radius_km)} km`,
    selectedParks.length ? `${selectedParks.length} park${selectedParks.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!minNightsDirty) setMinNightsInput(String(effectiveMinNights));
  }, [effectiveMinNights, minNightsDirty]);

  function commitPartyInput(value = partyInput) {
    const next = clampIntegerInput(value, 1, 12, state.party_size || 2);
    setPartyInput(String(next));
    setState({ party_size: next, page: 1 });
    return next;
  }

  function commitMinNightsInput(value = minNightsInput) {
    const next = clampIntegerInput(value, minRouteNights, maxMinNights, effectiveMinNights);
    setMinNightsInput(String(next));
    setMinNightsDirty(false);
    setState({ min_nights: next, flexible: true, page: 1 });
    return next;
  }

  function renderNearSuggestions(menuClassName = "z-[70] max-h-72") {
    const query = nearInput.trim();
    const shouldShow =
      nearSuggestionsOpen &&
      query &&
      (nearSuggestionsLoading || nearSuggestions.length > 0 || query.length >= 2);
    if (!shouldShow) return null;

    return (
      <div className={`absolute left-0 right-0 top-full mt-1 overflow-y-auto rounded-md bg-white py-1 shadow-xl ring-1 ring-stone-200 ${menuClassName}`}>
        {nearSuggestionsLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-stone-500">
            <Loader2 size={13} className="animate-spin" />
            Finding places
          </div>
        )}
        {!nearSuggestionsLoading && nearSuggestions.length > 0 ? nearSuggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectNearSuggestion(suggestion)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-forest-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-700">
              {suggestion.source === "park" ? <Tent size={15} /> : <MapPin size={15} />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-stone-950">{suggestion.label}</span>
              <span className="block truncate text-xs text-stone-500">{suggestion.detail}</span>
            </span>
          </button>
        )) : !nearSuggestionsLoading ? (
          <div className="px-3 py-2 text-xs text-stone-500">No park or Ontario place matches that search.</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[calc(100dvh-3.5rem)] flex-col bg-stone-50 lg:min-h-[42rem]">
      <div className="sticky top-14 z-40 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-2 sm:px-6 lg:px-8">
          <div className="lg:hidden">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 text-left shadow-sm ring-1 ring-stone-200 transition active:scale-[0.99]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MapPin size={15} className="shrink-0 text-forest-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-stone-950">{mobilePrimarySummary}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-stone-500">{mobileSecondarySummary}</span>
                  </span>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-50 text-stone-600 ring-1 ring-stone-200">
                    <Sliders size={15} />
                  </span>
                  {mobileActiveCount > 0 && (
                    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-forest-700 px-1.5 text-[10px] font-semibold text-white">
                      {mobileActiveCount}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-forest-700 text-white shadow-sm transition hover:bg-forest-800 disabled:opacity-50"
                onClick={runSearch}
                disabled={searchDisabled}
                aria-label="Search"
              >
                {loading || resolvingNear ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none">
                {state.flexible && <span className="chip shrink-0 bg-lake-50 text-lake-800 ring-1 ring-lake-200">Flexible</span>}
                {state.stay_mode !== "same_site" && <span className="chip shrink-0 bg-forest-50 text-forest-800 ring-1 ring-forest-200">{selectedStayMode.label}</span>}
                {advancedFilterCount > 0 && <span className="chip shrink-0 bg-stone-100 text-stone-700 ring-1 ring-stone-200">{advancedFilterCount} filters</span>}
              </div>
              <div className="inline-flex shrink-0 rounded-md bg-stone-100 p-1 ring-1 ring-stone-200">
                {VIEW_MODES.map((mode) => {
                  const Icon = mode === "list" ? List : MapIcon;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setState({ view: mode })}
                      className={`inline-flex h-8 w-9 items-center justify-center rounded ${
                        state.view === mode ? "bg-white text-stone-950 shadow-sm" : "text-stone-600"
                      }`}
                      aria-label={`Show ${mode}`}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="hidden rounded-lg bg-white p-1.5 ring-1 ring-stone-200 lg:block">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-[minmax(15rem,1.05fr)_minmax(17rem,1.25fr)_minmax(8.5rem,0.65fr)_minmax(8.5rem,0.65fr)_minmax(11rem,0.75fr)_auto_auto]">
              <div className="relative col-span-2 rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600 sm:col-span-3 lg:col-span-1 lg:min-w-0">
                <div className="mb-0.5 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                    <MapPin size={12} /> Near
                  </label>
                  <button
                    type="button"
                    onClick={useDeviceLocation}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-forest-700 ring-1 ring-stone-200 transition hover:bg-forest-50"
                  >
                    {resolvingNear ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
                    <span>Use location</span>
                  </button>
                </div>
                <input
                  type="text"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none placeholder:text-stone-400"
                  placeholder="Town, city, park, or postal code"
                  value={nearInput}
                  autoComplete="off"
                  onFocus={() => setNearSuggestionsOpen(true)}
                  onBlur={() => window.setTimeout(() => setNearSuggestionsOpen(false), 120)}
                  onChange={(e) => {
                    setNearInput(e.target.value);
                    setNearSuggestionsOpen(true);
                    if (selectedNearSuggestion && e.target.value !== selectedNearSuggestion.label) {
                      setSelectedNearSuggestion(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runSearch();
                    }
                  }}
                />
                {renderNearSuggestions()}
              </div>

              <div className="relative col-span-2 rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600 sm:col-span-3 lg:col-span-1 lg:min-w-0">
                <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  <Search size={12} /> Limit to parks
                </label>
                <input
                  type="text"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none placeholder:text-stone-400"
                  placeholder={selectedParks.length ? "Add another park" : "Add exact park"}
                  value={parkInput}
                  autoComplete="off"
                  onChange={(e) => setParkInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const first = parkSuggestions[0];
                      if (first) addParkFilter(first);
                      else runSearch();
                    }
                  }}
                />
                {parkInput.trim() && (
                  <div className="absolute left-0 right-0 top-full z-[70] mt-1 max-h-72 overflow-y-auto rounded-md bg-white py-1 shadow-xl ring-1 ring-stone-200">
                    {parkSuggestions.length > 0 ? parkSuggestions.map((park) => (
                      <button
                        key={park.slug}
                        type="button"
                        onClick={() => addParkFilter(park)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-forest-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-stone-950">{park.name}</span>
                          <span className="block truncate text-xs text-stone-500">{displayOperatorName(park.operator)} · {park.region}</span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-forest-700">{park.available_sites.toLocaleString()} open</span>
                      </button>
                    )) : (
                      <div className="px-3 py-2 text-xs text-stone-500">
                        {allParks.length ? "No park matches that search." : "Loading parks..."}
                      </div>
                    )}
                  </div>
                )}
                {selectedParks.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedParks.map((park) => (
                      <button
                        key={park.slug}
                        type="button"
                        onClick={() => removeParkFilter(park.slug)}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-forest-50 px-2 py-1 text-[11px] font-semibold text-forest-800 ring-1 ring-forest-200 transition hover:bg-forest-100"
                        aria-label={`Remove ${park.name} from park filter`}
                      >
                        <span className="truncate">{park.name}</span>
                        <X size={12} className="shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="col-span-2 rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600 sm:col-span-1">
                <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  <Calendar size={12} /> Check-in
                </label>
                <input
                  type="date"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                  min={minimumCheckInDate}
                  value={state.start_date}
                  onChange={(e) => updateStartDate(e.target.value)}
                />
              </div>

              <div className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600">
                <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  <Calendar size={12} /> Check-out
                </label>
                <input
                  type="date"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                  min={minimumCheckOutDate}
                  value={state.end_date}
                  onChange={(e) => updateEndDate(e.target.value)}
                />
              </div>

              <div className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600">
                <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  <EquipmentIcon size={12} /> Equipment
                </label>
                <select
                  className="w-full min-w-0 appearance-none bg-transparent text-sm font-semibold text-stone-950 outline-none"
                  value={state.equipment}
                  onChange={(e) => applyEquipment(e.target.value)}
                >
                  {SEARCH_EQUIPMENT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="btn-primary col-span-2 min-h-[3.2rem] px-5 text-sm font-semibold sm:col-span-1 lg:min-w-[7.25rem]"
                onClick={runSearch}
                disabled={searchDisabled}
              >
                {loading || resolvingNear ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Searching
                  </>
                ) : (
                  <>
                    <Search size={15} /> Search
                  </>
                )}
              </button>
              <button
                type="button"
                className="inline-flex min-h-[3.2rem] items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50"
                onClick={resetFilters}
              >
                <RotateCcw size={15} /> Reset
              </button>
            </div>

            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <details className="group rounded-md bg-stone-50 ring-1 ring-stone-200">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-stone-800 transition hover:bg-white">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Route size={13} className="text-stone-500" />
                    <span>Trip</span>
                    <span className="truncate text-stone-500">{selectedStayMode.label}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    {tripOptionCount > 0 && <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-stone-500 ring-1 ring-stone-200">{tripOptionCount}</span>}
                    <ChevronDown size={14} className="text-stone-400 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="grid gap-1.5 border-t border-stone-200 p-1.5 sm:grid-cols-3">
                {STAY_MODE_OPTIONS.map((option) => {
                  const active = state.stay_mode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => updateStayMode(option.id)}
                      className={`rounded-md px-3 py-2 text-left ring-1 transition ${
                        active
                          ? "bg-forest-700 text-white ring-forest-700"
                          : "bg-stone-50 text-stone-800 ring-stone-200 hover:bg-white"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        <Route size={13} /> {option.label}
                      </span>
                      <span className={`mt-0.5 hidden text-[11px] leading-tight sm:block ${active ? "text-forest-50" : "text-stone-500"}`}>
                        {option.detail}
                      </span>
                    </button>
                  );
                })}
                </div>
                {state.stay_mode === "anywhere" && (
                  <div className="border-t border-stone-200 p-1.5 pt-0">
                    <label className="mt-1.5 inline-flex h-8 w-full items-center gap-1.5 rounded-md bg-white px-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                      <MapPin size={12} className="shrink-0 text-stone-400" />
                      <input
                        type="text"
                        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-stone-400"
                        placeholder="End near (optional)"
                        value={endInput}
                        onChange={(e) => setEndInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            runSearch();
                          }
                        }}
                      />
                    </label>
                  </div>
                )}
              </details>

              <details className="group rounded-md bg-stone-50 ring-1 ring-stone-200">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-stone-800 transition hover:bg-white">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Sliders size={13} className="text-stone-500" />
                    <span>Planning</span>
                    <span className="truncate text-stone-500">{GROUP_LABELS[state.group_by]} · {SORT_LABELS[state.sort]} · {normalizeSearchRadiusKm(state.radius_km)} km</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    {planningOptionCount > 0 && <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-stone-500 ring-1 ring-stone-200">{planningOptionCount}</span>}
                    <ChevronDown size={14} className="text-stone-400 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-200 p-1.5">
                <label className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                  <span>Group</span>
                  <select
                    className="bg-transparent text-right outline-none"
                    value={state.group_by}
                    onChange={(e) => updateGroupBy(e.target.value as typeof state.group_by)}
                  >
                    {GROUP_OPTIONS.map((option) => (
                      <option key={option} value={option}>{GROUP_LABELS[option]}</option>
                    ))}
                  </select>
                </label>
                <label className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                  <span>Sort</span>
                  <select
                    className="bg-transparent text-right outline-none"
                    value={state.sort}
                    onChange={(e) => setState({ sort: e.target.value as typeof state.sort, page: 1 })}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{SORT_LABELS[option]}</option>
                    ))}
                  </select>
                </label>
                <label className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                  <span>Radius</span>
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      aria-label="Search radius in kilometers"
                      className="w-16 bg-transparent text-right tabular-nums outline-none"
                      min={MIN_SEARCH_RADIUS_KM}
                      max={MAX_SEARCH_RADIUS_KM}
                      step={10}
                      value={radiusInput}
                      onChange={(e) => setRadiusInput(e.target.value)}
                      onBlur={(e) => commitRadiusInput(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void runSearch();
                        }
                      }}
                    />
                    <span className="text-stone-500">km</span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setFlexibleDates(!state.flexible)}
                  className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${
                    state.flexible ? "bg-lake-700 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
                  }`}
                >
                  Flexible window
                </button>
                <label className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                  <span>Nights</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Minimum nights"
                    className="w-11 bg-transparent text-right outline-none"
                    value={minNightsInput}
                    onChange={(e) => {
                      setMinNightsInput(e.target.value.replace(/\D/g, ""));
                      setMinNightsDirty(true);
                    }}
                    onBlur={(e) => commitMinNightsInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitMinNightsInput(e.currentTarget.value);
                      }
                    }}
                  />
                </label>
                <label className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                  <span>Party</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Party size"
                    className="w-10 bg-transparent text-right outline-none"
                    value={partyInput}
                    onChange={(e) => setPartyInput(e.target.value.replace(/\D/g, ""))}
                    onBlur={(e) => commitPartyInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitPartyInput(e.currentTarget.value);
                      }
                    }}
                  />
                </label>
                </div>
              </details>

              <details className="group rounded-md bg-stone-50 ring-1 ring-stone-200">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-stone-800 transition hover:bg-white">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Sliders size={13} className="text-stone-500" />
                    <span>Filters</span>
                    <span className="truncate text-stone-500">
                      {advancedFilterCount ? `${advancedFilterCount} active` : "Site types and amenities"}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    {advancedFilterCount > 0 && <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-stone-500 ring-1 ring-stone-200">{advancedFilterCount}</span>}
                    <ChevronDown size={14} className="text-stone-400 transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="flex items-center gap-2 overflow-x-auto border-t border-stone-200 p-1.5 scrollbar-none">
                  {SITE_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setState({
                        site_types: toggle(state.site_types, t),
                        equipment: "any",
                        equipment_length_ft: null,
                        page: 1,
                      })}
                      className={`chip shrink-0 ring-1 ${
                        state.site_types.includes(t)
                          ? "bg-forest-700 text-white ring-forest-700"
                          : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                  <span className="h-4 w-px shrink-0 bg-stone-300" />
                  {Object.entries(AMENITIES).map(([code, a]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setState({ amenities: toggle(state.amenities, code), page: 1 })}
                      className={`chip shrink-0 ring-1 ${
                        state.amenities.includes(code)
                          ? "bg-lake-700 text-white ring-lake-700"
                          : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {(locationMessage || dateBlockMessage) && (
            <div className={`mt-1 text-xs ${dateBlockMessage ? "font-semibold text-amber-700" : "text-stone-500"}`}>
              {dateBlockMessage ?? locationMessage}
            </div>
          )}
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[90] bg-stone-950/35 lg:hidden" onClick={() => setMobileFiltersOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-hidden rounded-t-lg bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Search controls"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Search controls</div>
                <div className="truncate text-sm font-semibold text-stone-950">{mobilePrimarySummary}</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-700 transition hover:bg-stone-200"
                aria-label="Close search controls"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[calc(90dvh-8rem)] space-y-4 overflow-y-auto px-4 py-3 pb-24">
              <section className="space-y-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <div className="relative min-w-0 rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 focus-within:bg-white focus-within:ring-forest-600">
                    <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      <MapPin size={12} /> Near
                    </label>
                    <input
                      type="text"
                      className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none placeholder:text-stone-400"
                      placeholder="Town, city, park, or postal code"
                      value={nearInput}
                      autoComplete="off"
                      onFocus={() => setNearSuggestionsOpen(true)}
                      onBlur={() => window.setTimeout(() => setNearSuggestionsOpen(false), 120)}
                      onChange={(e) => {
                        setNearInput(e.target.value);
                        setNearSuggestionsOpen(true);
                        if (selectedNearSuggestion && e.target.value !== selectedNearSuggestion.label) {
                          setSelectedNearSuggestion(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setMobileFiltersOpen(false);
                          void runSearch();
                        }
                      }}
                    />
                    {renderNearSuggestions("z-[95] max-h-60")}
                  </div>
                  <button
                    type="button"
                    onClick={useDeviceLocation}
                    className="inline-flex h-[3.5rem] w-12 items-center justify-center rounded-md bg-white text-forest-700 ring-1 ring-stone-200 transition hover:bg-forest-50"
                    aria-label="Use current location"
                  >
                    {resolvingNear ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                  </button>
                </div>

                <div className="relative rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 focus-within:bg-white focus-within:ring-forest-600">
                  <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                    <Search size={12} /> Limit to parks
                  </label>
                  <input
                    type="text"
                    className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none placeholder:text-stone-400"
                    placeholder={selectedParks.length ? "Add another park" : "Add exact park"}
                    value={parkInput}
                    autoComplete="off"
                    onChange={(e) => setParkInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const first = parkSuggestions[0];
                        if (first) addParkFilter(first);
                      }
                    }}
                  />
                  {parkInput.trim() && (
                    <div className="absolute left-0 right-0 top-full z-[95] mt-1 max-h-60 overflow-y-auto rounded-md bg-white py-1 shadow-xl ring-1 ring-stone-200">
                      {parkSuggestions.length > 0 ? parkSuggestions.map((park) => (
                        <button
                          key={park.slug}
                          type="button"
                          onClick={() => addParkFilter(park)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-forest-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-stone-950">{park.name}</span>
                            <span className="block truncate text-xs text-stone-500">{displayOperatorName(park.operator)} · {park.region}</span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-forest-700">{park.available_sites.toLocaleString()} open</span>
                        </button>
                      )) : (
                        <div className="px-3 py-2 text-xs text-stone-500">
                          {allParks.length ? "No park matches that search." : "Loading parks..."}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedParks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedParks.map((park) => (
                        <button
                          key={park.slug}
                          type="button"
                          onClick={() => removeParkFilter(park.slug)}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-forest-50 px-2 py-1 text-[11px] font-semibold text-forest-800 ring-1 ring-forest-200 transition hover:bg-forest-100"
                          aria-label={`Remove ${park.name} from park filter`}
                        >
                          <span className="truncate">{park.name}</span>
                          <X size={12} className="shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 focus-within:bg-white focus-within:ring-forest-600">
                    <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      <Calendar size={12} /> Check-in
                    </span>
                    <input
                      type="date"
                      className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                      min={minimumCheckInDate}
                      value={state.start_date}
                      onChange={(e) => updateStartDate(e.target.value)}
                    />
                  </label>
                  <label className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 focus-within:bg-white focus-within:ring-forest-600">
                    <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      <Calendar size={12} /> Check-out
                    </span>
                    <input
                      type="date"
                      className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                      min={minimumCheckOutDate}
                      value={state.end_date}
                      onChange={(e) => updateEndDate(e.target.value)}
                    />
                  </label>
                </div>

                <label className="block rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 focus-within:bg-white focus-within:ring-forest-600">
                  <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                    <EquipmentIcon size={12} /> Equipment
                  </span>
                  <select
                    className="w-full min-w-0 appearance-none bg-transparent text-sm font-semibold text-stone-950 outline-none"
                    value={state.equipment}
                    onChange={(e) => applyEquipment(e.target.value)}
                  >
                    {SEARCH_EQUIPMENT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </section>

              <section className="space-y-2 border-t border-stone-200 pt-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <Route size={13} /> Trip
                </div>
                <div className="grid gap-2">
                  {STAY_MODE_OPTIONS.map((option) => {
                    const active = state.stay_mode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => updateStayMode(option.id)}
                        className={`rounded-md px-3 py-2 text-left ring-1 transition ${
                          active
                            ? "bg-forest-700 text-white ring-forest-700"
                            : "bg-stone-50 text-stone-800 ring-stone-200 hover:bg-white"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <Route size={14} /> {option.label}
                        </span>
                        <span className={`mt-0.5 block text-xs leading-tight ${active ? "text-forest-50" : "text-stone-500"}`}>
                          {option.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {state.stay_mode === "anywhere" && (
                  <label className="inline-flex h-10 w-full items-center gap-1.5 rounded-md bg-stone-50 px-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">
                    <MapPin size={13} className="shrink-0 text-stone-400" />
                    <input
                      type="text"
                      className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-stone-400"
                      placeholder="End near (optional)"
                      value={endInput}
                      onChange={(e) => setEndInput(e.target.value)}
                    />
                  </label>
                )}
              </section>

              <section className="space-y-2 border-t border-stone-200 pt-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <Sliders size={13} /> Planning
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="rounded-md bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                    <span className="block text-stone-500">Group</span>
                    <select
                      className="mt-1 w-full bg-transparent text-sm text-stone-950 outline-none"
                      value={state.group_by}
                      onChange={(e) => updateGroupBy(e.target.value as typeof state.group_by)}
                    >
                      {GROUP_OPTIONS.map((option) => (
                        <option key={option} value={option}>{GROUP_LABELS[option]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="rounded-md bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                    <span className="block text-stone-500">Sort</span>
                    <select
                      className="mt-1 w-full bg-transparent text-sm text-stone-950 outline-none"
                      value={state.sort}
                      onChange={(e) => setState({ sort: e.target.value as typeof state.sort, page: 1 })}
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option} value={option}>{SORT_LABELS[option]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="rounded-md bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                    <span className="block text-stone-500">Radius</span>
                    <span className="mt-1 flex items-center gap-1">
                      <input
                        type="number"
                        aria-label="Search radius in kilometers"
                        className="min-w-0 flex-1 bg-transparent text-sm text-stone-950 outline-none"
                        min={MIN_SEARCH_RADIUS_KM}
                        max={MAX_SEARCH_RADIUS_KM}
                        step={10}
                        value={radiusInput}
                        onChange={(e) => setRadiusInput(e.target.value)}
                        onBlur={(e) => commitRadiusInput(e.currentTarget.value)}
                      />
                      <span className="text-stone-500">km</span>
                    </span>
                  </label>
                  <label className="rounded-md bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                    <span className="block text-stone-500">Party</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Party size"
                      className="mt-1 w-full bg-transparent text-sm text-stone-950 outline-none"
                      value={partyInput}
                      onChange={(e) => setPartyInput(e.target.value.replace(/\D/g, ""))}
                      onBlur={(e) => commitPartyInput(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitPartyInput(e.currentTarget.value);
                        }
                      }}
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFlexibleDates(!state.flexible)}
                    className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${
                      state.flexible ? "bg-lake-700 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    Flexible window
                  </button>
                  <label className="inline-flex h-9 flex-1 items-center gap-2 rounded-md bg-white px-3 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                    <span>Nights</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Minimum nights"
                      className="min-w-0 flex-1 bg-transparent text-right outline-none"
                      value={minNightsInput}
                      onChange={(e) => {
                        setMinNightsInput(e.target.value.replace(/\D/g, ""));
                        setMinNightsDirty(true);
                      }}
                      onBlur={(e) => commitMinNightsInput(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitMinNightsInput(e.currentTarget.value);
                        }
                      }}
                    />
                  </label>
                </div>
              </section>

              <section className="space-y-2 border-t border-stone-200 pt-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <Sliders size={13} /> Filters
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SITE_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setState({
                        site_types: toggle(state.site_types, t),
                        equipment: "any",
                        equipment_length_ft: null,
                        page: 1,
                      })}
                      className={`chip ring-1 ${
                        state.site_types.includes(t)
                          ? "bg-forest-700 text-white ring-forest-700"
                          : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(AMENITIES).map(([code, a]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setState({ amenities: toggle(state.amenities, code), page: 1 })}
                      className={`chip ring-1 ${
                        state.amenities.includes(code)
                          ? "bg-lake-700 text-white ring-lake-700"
                          : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <div className="absolute inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50"
                  onClick={resetFilters}
                >
                  <RotateCcw size={15} /> Reset
                </button>
                <button
                  type="button"
                  className="btn-primary h-11 w-full text-sm font-semibold"
                  onClick={() => {
                    setMobileFiltersOpen(false);
                    void runSearch();
                  }}
                  disabled={searchDisabled}
                >
                  {loading || resolvingNear ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Searching
                    </>
                  ) : (
                    <>
                      <Search size={15} /> Search
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 px-3 py-2 sm:px-6 lg:px-8 lg:py-3">
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(28rem,0.9fr)_minmax(0,1.1fr)]">
          <section
            className={`min-h-0 flex-col overflow-hidden rounded-lg bg-white ring-1 ring-stone-200 ${
              state.view === "map" ? "hidden lg:flex" : "flex"
            }`}
          >
            <header className="shrink-0 border-b border-stone-200 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {selectedStayMode.label}
                    {state.flexible ? " · flexible" : ""}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-stone-950">
                    {nearInput.trim() || "Ontario"}
                    {dateWindowNights ? ` · ${dateWindowNights} nights` : ""}
                    {selectedEquipment.id !== "any" ? ` · ${selectedEquipment.shortLabel}` : ""}
                    {hasRouteEndpoint ? ` · ends near ${state.end_loc || endInput}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm text-stone-600">
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Searching
                    </span>
                  ) : data ? (
                    <>
                      <span className="font-semibold text-stone-950">{data.total.toLocaleString()}</span> {resultWord}
                      {groupedMode && groupTotal > 0 ? (
                        <span className="text-stone-400"> / {groupTotal.toLocaleString()} {groupUnit}</span>
                      ) : data.total > data.results.length ? (
                        <span className="text-stone-400"> / showing {data.results.length}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-stone-500">Ready</span>
                  )}
                </div>
              </div>
              {data && !loading && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                  <span>Median freshness {data.freshness_p50_minutes}m</span>
                  {groupedMode && groupTotal > 0 ? (
                    <span>Showing groups {pageStart.toLocaleString()}-{pageEnd.toLocaleString()}</span>
                  ) : data.total > 0 ? (
                    <span>Showing results {pageStart.toLocaleString()}-{pageEnd.toLocaleString()}</span>
                  ) : null}
                </div>
              )}
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {routeNeedsDates && !loading && (
                <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
                  Choose at least two nights to build routes that change campsites every night.
                </div>
              )}
              {data && data.total === 0 && !loading && !routeNeedsDates && (
                <div className={`rounded-lg border border-dashed p-8 text-center text-sm ${
                  dateBlockMessage ? "border-amber-300 bg-amber-50 text-amber-900" : "border-stone-300 bg-stone-50 text-stone-600"
                }`}>
                  {dateBlockMessage ?? "No availability matches your filters. Try expanding the radius, allowing moves, or easing site filters."}
                </div>
              )}
              {data && data.total > 0 && groupedMode && groupedResults.length === 0 && !loading && (
                <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
                  No groups on this page.
                </div>
              )}
              {!data && !loading && !routeNeedsDates && (
                <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
                  Start a search to see results.
                </div>
              )}
              {groupedMode ? groupedResults.map((group) => {
                const groupFocusSlug = state.group_by === "park" ? group.key : group.results[0]?.park.slug;
                const activeInMap = groupFocusSlug != null && activeMapGroup?.key === groupFocusSlug;
                const groupRenderKey = `${state.group_by}:${group.key}`;
                const visibleResultCount = visibleResultCountForGroup(groupRenderKey, group);
                const hiddenLoadedCount = group.results.length - visibleResultCount;
                return (
                <details
                  key={group.key}
                  className={`group overflow-hidden rounded-lg bg-stone-50 ring-1 transition ${
                    activeInMap ? "ring-forest-300" : "ring-stone-200"
                  }`}
                  onMouseEnter={() => focusMapPark(groupFocusSlug)}
                  onFocus={() => focusMapPark(groupFocusSlug)}
                >
                  <summary
                    className={`cursor-pointer list-none transition ${activeInMap ? "bg-forest-50/70" : "hover:bg-white"}`}
                    onClick={() => focusMapPark(groupFocusSlug)}
                  >
                    {state.group_by === "park" && group.hero_image_url && (
                      <div className="relative h-8 overflow-hidden bg-stone-200 sm:h-9">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageProxyUrl(group.hero_image_url, "strip") ?? group.hero_image_url}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          fetchPriority="low"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-stone-950/30 via-transparent to-stone-950/10" />
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 px-2.5 py-1.5">
                      <ChevronRight size={14} className="shrink-0 text-stone-400 transition-transform group-open:rotate-90" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-stone-950">{group.label}</div>
                        <div className="truncate text-xs text-stone-500">
                          {group.detail}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {state.group_by === "park" && group.distance != null && Number.isFinite(group.distance) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-stone-600 ring-1 ring-stone-200">
                            <MapPin size={10} /> {group.distance.toFixed(0)} km
                          </span>
                        )}
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-stone-600 ring-1 ring-stone-200">
                          {group.result_count.toLocaleString()}
                        </span>
                      </div>
                    </div>
	                  </summary>
	                  <div className="space-y-2 border-t border-stone-200 p-2">
	                    {group.results.slice(0, visibleResultCount).map((r, index) => (
	                      <div
	                        key={`${r.site.id}-${r.availability.nights.join("-")}-${r.stay?.mode ?? "single"}-${index}`}
	                        onMouseEnter={() => focusMapPark(r.park.slug)}
                        onFocus={() => focusMapPark(r.park.slug)}
                      >
                        <ResultCard
                          result={r}
                          onOpenResult={openResult}
                          onOpenSiteDetails={openSiteDetails}
                          loadingSiteId={loadingSiteId}
	                        />
	                      </div>
	                    ))}
	                    {hiddenLoadedCount > 0 && (
	                      <button
	                        type="button"
	                        onClick={() => loadMoreGroupResults(groupRenderKey, group.results.length)}
	                        className="flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50"
	                      >
	                        Load more {Math.min(GROUP_RESULTS_INCREMENT, hiddenLoadedCount).toLocaleString()} of {hiddenLoadedCount.toLocaleString()}
	                      </button>
	                    )}
	                    {visibleResultCount >= group.results.length && group.result_count > group.results.length && (
	                      <div className="rounded-md bg-white px-3 py-2 text-xs text-stone-500 ring-1 ring-stone-200">
	                        Showing first {group.results.length} results in this group. Refine filters to narrow it further.
	                      </div>
                    )}
                  </div>
                </details>
              );}) : data?.results.map((r, index) => (
                <div
                  key={`${r.site.id}-${r.availability.nights.join("-")}-${r.stay?.mode ?? "single"}-${index}`}
                  onMouseEnter={() => focusMapPark(r.park.slug)}
                  onFocus={() => focusMapPark(r.park.slug)}
                >
                  <ResultCard
                    result={r}
                    onOpenResult={openResult}
                    onOpenSiteDetails={openSiteDetails}
                    loadingSiteId={loadingSiteId}
                  />
                </div>
              ))}

              {data && (hasPreviousPage || hasNextPage) && !loading && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-200">
                  <button
                    type="button"
                    onClick={() => goToPage(state.page - 1)}
                    disabled={!hasPreviousPage}
                    className="rounded-md bg-stone-100 px-3 py-1.5 font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-stone-500">
                    Page {state.page}
                    {groupedMode && groupTotal > 0
                      ? ` / groups ${pageStart}-${pageEnd} of ${groupTotal.toLocaleString()}`
                      : data.total > 0
                      ? ` / results ${pageStart}-${pageEnd} of ${data.total.toLocaleString()}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(state.page + 1)}
                    disabled={!hasNextPage}
                    className="rounded-md bg-stone-100 px-3 py-1.5 font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </section>

          <section
            className={`relative min-h-0 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200 ${
              state.view === "list" ? "hidden lg:block" : "block"
            }`}
          >
            <OntarioMap
              parks={data ? searchMapParks : mapParks}
              anchor={effectiveAnchor}
              radiusKm={state.radius_km}
              matchedSlugs={data ? null : matchedSlugs}
              mode={data ? "search" : "explore"}
              resultLabel={resultWord}
              showCategoryFilters={false}
              showCompactCategoryLegend
              fitToMarkers={Boolean(data?.results.length)}
              focusedSlug={activeMapGroup?.key ?? null}
              focusZoom={9.1}
              onParkSelect={(slug) => {
                const index = mapParkGroups.findIndex((group) => group.key === slug);
                if (index >= 0) setActiveMapGroupIndex(index);
              }}
            />
            {data && (
              <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-20 sm:bottom-3 sm:left-3 sm:right-3 lg:hidden">
                <div className="pointer-events-auto max-h-[36dvh] overflow-y-auto rounded-lg bg-white/95 p-2 shadow-xl shadow-stone-950/10 ring-1 ring-stone-200 backdrop-blur">
                  <div className="flex items-center justify-between gap-3 px-1 pb-2 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-stone-950">Matching parks</div>
                      <div className="text-[11px] text-stone-500">
                        {visibleMapPageStart}-{visibleMapPageEnd} of {mapParkGroups.length.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-stone-500">
                      <button
                        type="button"
                        onClick={() => setActiveMapGroupIndex((index) => Math.max(0, index - MAP_GROUPS_PER_PAGE))}
                        disabled={activeMapPage === 0}
                        className="inline-flex h-6 w-6 items-center justify-center rounded bg-white text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-35"
                        aria-label="Previous map result page"
                      >
                        <ChevronRight size={12} className="rotate-180" />
                      </button>
                      <span className="min-w-11 text-center text-[11px] font-semibold text-stone-500">
                        {clampedActiveMapGroupIndex + 1}/{Math.max(1, mapParkGroups.length)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveMapGroupIndex((index) => Math.min(mapParkGroups.length - 1, index + MAP_GROUPS_PER_PAGE))}
                        disabled={visibleMapPageEnd >= mapParkGroups.length}
                        className="inline-flex h-6 w-6 items-center justify-center rounded bg-white text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-50 disabled:opacity-35"
                        aria-label="Next map result page"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {visibleMapParkGroups.length > 0 ? visibleMapParkGroups.map((group, localIndex) => {
                      const groupIndex = activeMapPage * MAP_GROUPS_PER_PAGE + localIndex;
                      const active = group.key === activeMapGroup?.key;
                      return (
                        <div
                          key={group.key}
                          className={`group/map-row flex w-full items-center gap-1.5 rounded-md p-1.5 text-left ring-1 transition hover:bg-stone-50 hover:ring-stone-300 ${
                            active ? "bg-forest-50 ring-forest-300" : "bg-white ring-stone-200"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveMapGroupIndex(groupIndex)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {group.hero_image_url ? (
                              <span className="relative h-10 w-12 shrink-0 overflow-hidden rounded bg-stone-100">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imageProxyUrl(group.hero_image_url, "thumb") ?? group.hero_image_url}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  fetchPriority="low"
                                />
                              </span>
                            ) : (
                              <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded bg-forest-50 text-forest-700">
                                <MapPin size={15} />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-stone-950">{group.label}</span>
                              <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-stone-500">
                                {group.distance != null && Number.isFinite(group.distance) && (
                                  <span className="inline-flex shrink-0 items-center gap-1">
                                    <MapPin size={10} /> {group.distance.toFixed(0)} km
                                  </span>
                                )}
                                <span className="truncate">{group.detail}</span>
                              </span>
                            </span>
                          </button>
                          <span className="shrink-0 rounded-full bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-600 ring-1 ring-stone-200">
                            {group.result_count.toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMapGroupIndex(groupIndex);
                              setExpandedMapGroup(group);
                            }}
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1 transition ${
                              active
                                ? "bg-forest-700 text-white ring-forest-700"
                                : "bg-white text-stone-600 ring-stone-200 hover:bg-stone-50"
                            }`}
                            aria-label={`Show sites at ${group.label}`}
                          >
                            <ChevronRight size={15} />
                          </button>
                        </div>
                    );}) : (
                      <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 p-4 text-center text-xs text-stone-500">
                        No mapped parks on this page.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {expandedMapGroup && (
        <div
          className="fixed inset-0 z-[45] flex flex-col bg-stone-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-map-park-title"
        >
          <header className="shrink-0 bg-white shadow-sm ring-1 ring-stone-200">
            {expandedMapGroup.hero_image_url && (
              <div className="relative h-24 overflow-hidden bg-stone-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageProxyUrl(expandedMapGroup.hero_image_url, "strip") ?? expandedMapGroup.hero_image_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/35 via-transparent to-transparent" />
              </div>
            )}
            <div className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                    {expandedMapGroup.result_count.toLocaleString()} {resultWord}
                    {expandedMapGroup.distance != null && Number.isFinite(expandedMapGroup.distance)
                      ? ` · ${expandedMapGroup.distance.toFixed(0)} km`
                      : ""}
                  </div>
                  <h2 id="mobile-map-park-title" className="mt-0.5 truncate text-xl font-semibold text-stone-950">
                    {expandedMapGroup.label}
                  </h2>
                  <div className="mt-0.5 truncate text-sm text-stone-500">{expandedMapGroup.detail}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedMapGroup(null)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-700 transition hover:bg-stone-200"
                  aria-label="Close park sites"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Link
                  href={`/park/${expandedMapGroup.key}`}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-stone-900 px-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                >
                  Park page
                </Link>
                <button
                  type="button"
                  onClick={() => setExpandedMapGroup(null)}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50"
                >
                  Back to map
                </button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pb-6">
            {expandedMapGroup.results.slice(0, expandedMapVisibleResultCount).map((result, index) => (
              <ResultCard
                key={`${result.site.id}-${result.availability.nights.join("-")}-${result.stay?.mode ?? "single"}-${index}`}
                result={result}
                onOpenResult={openResult}
                onOpenSiteDetails={openSiteDetails}
                loadingSiteId={loadingSiteId}
              />
            ))}
            {expandedMapGroup.results.length > expandedMapVisibleResultCount && (
              <button
                type="button"
                onClick={() => loadMoreGroupResults(expandedMapGroupKey, expandedMapGroup.results.length)}
                className="flex w-full items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50"
              >
                Load more {Math.min(GROUP_RESULTS_INCREMENT, expandedMapGroup.results.length - expandedMapVisibleResultCount).toLocaleString()} of {(expandedMapGroup.results.length - expandedMapVisibleResultCount).toLocaleString()}
              </button>
            )}
            {expandedMapVisibleResultCount >= expandedMapGroup.results.length && expandedMapGroup.result_count > expandedMapGroup.results.length && (
              <div className="rounded-md bg-white px-3 py-2 text-xs text-stone-500 ring-1 ring-stone-200">
                Showing first {expandedMapGroup.results.length} results in this park. Refine filters to narrow it further.
              </div>
            )}
          </div>
        </div>
      )}

      <SiteDetailFlyout
        details={selectedSiteDetails}
        onClose={() => setSelectedSiteDetails(null)}
      />
      <ItineraryFlyout
        result={selectedItinerary}
        onClose={() => setSelectedItinerary(null)}
        onOpenSiteDetails={openSiteDetails}
      />
    </div>
  );
}
