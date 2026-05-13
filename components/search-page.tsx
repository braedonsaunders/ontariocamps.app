"use client";
import { useEffect, useMemo, useState } from "react";
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
import { AMENITIES, type SearchResponse, type SearchResult, type SearchResultGroup } from "@/lib/types";
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

const SITE_TYPES = ["tent", "rv", "cabin", "yurt"] as const;
const STAY_MODES = ["same_site", "same_park", "anywhere"] as const;
const VIEW_MODES = ["list", "map"] as const;
const GROUP_OPTIONS = ["park", "campground", "operator", "none"] as const;
const OPERATOR_OPTIONS: { id: string; label: string }[] = [
  { id: "ontario_parks", label: "Ontario Parks" },
  { id: "parks_canada", label: "Parks Canada" },
  { id: "st_lawrence_parks", label: "Parks of the St. Lawrence" },
  { id: "gtc_lprca", label: "Long Point CA" },
  { id: "gtc_stclair", label: "St. Clair CA" },
  { id: "gtc_grca", label: "Grand River CA" },
  { id: "gtc_trca", label: "Toronto & Region CA" },
  { id: "gtc_npca", label: "Niagara Peninsula CA" },
  { id: "gtc_otonabee", label: "Otonabee CA" },
  { id: "gtc_upperthames", label: "Upper Thames CA" },
  { id: "gtc_maitland", label: "Maitland Valley CA" },
  { id: "gtc_catfish", label: "Catfish Creek CA" },
  { id: "gtc_hca", label: "Hamilton CA" },
];
const SORT_OPTIONS = ["distance", "route", "moves", "availability", "freshness", "name", "price"] as const;
const RAW_RESULTS_PER_PAGE = 60;
const GROUPS_PER_PAGE = 10;
const RESULTS_PER_GROUP = 60;

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
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

type GeocodeSuggestion = {
  label: string;
  lat: number;
  lng: number;
};

/** Match a typed location label against PRESET_LOCATIONS — case-insensitive
 *  exact-or-prefix match on either the key or the display label. Returns the
 *  preset's coords if matched, or null otherwise. */
function resolveNear(input: string): { lat: number; lng: number; label: string } | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  // Exact key match first
  if (PRESET_LOCATIONS[q]) return PRESET_LOCATIONS[q];
  // Case-insensitive label match
  for (const p of Object.values(PRESET_LOCATIONS)) {
    if (p.label.toLowerCase() === q) return p;
  }
  // Prefix-on-label so "tor" → Toronto
  for (const p of Object.values(PRESET_LOCATIONS)) {
    if (p.label.toLowerCase().startsWith(q)) return p;
  }
  return null;
}

async function geocodeNear(input: string): Promise<GeocodeSuggestion | null> {
  const query = input.trim();
  if (query.length < 2) return null;
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { suggestions?: GeocodeSuggestion[] };
  return data.suggestions?.[0] ?? null;
}

function rangeNights(start: string, end: string): number | null {
  if (!start || !end) return null;
  const startTime = new Date(`${start}T00:00:00`).getTime();
  const endTime = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return null;
  return Math.round((endTime - startTime) / 86_400_000);
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
      detail = parks.length > 1 ? `${parks.length} parks on route` : `${result.park.operator} · ${result.campground.name}`;
    } else if (groupBy === "campground") {
      key = result.campground.id;
      label = result.campground.name;
      detail = `${result.park.name} · ${result.park.operator}`;
    } else if (groupBy === "operator") {
      key = result.park.operator_id;
      label = result.park.operator;
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
    park_slugs: parseAsArrayOf(parseAsString).withDefault([]),
    stay_mode: parseAsStringLiteral(STAY_MODES).withDefault("same_site"),
    view: parseAsStringLiteral(VIEW_MODES).withDefault("list"),
    group_by: parseAsStringLiteral(GROUP_OPTIONS).withDefault("park"),
    sort: parseAsStringLiteral(SORT_OPTIONS).withDefault("distance"),
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
  const [endInput, setEndInput] = useState<string>(() => state.end_loc);
  const [parkInput, setParkInput] = useState("");

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvingNear, setResolvingNear] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [selectedSiteDetails, setSelectedSiteDetails] = useState<SiteFlyoutDetails | null>(null);
  const [selectedItinerary, setSelectedItinerary] = useState<SearchResult | null>(null);
  const [loadingSiteId, setLoadingSiteId] = useState<string | null>(null);
  const [allParks, setAllParks] = useState<ParkSummary[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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

  // Resolve lat/lng from the typed "near" string (preset match) or explicit
  // lat/lng params from the URL.
  const effectiveAnchor = useMemo(() => {
    if (state.lat != null && state.lng != null) return { lat: state.lat, lng: state.lng };
    const preset = resolveNear(state.loc);
    return preset ? { lat: preset.lat, lng: preset.lng } : null;
  }, [state.lat, state.lng, state.loc]);

  async function runSearch() {
    // Commit typed place strings into state only when the user runs a search.
    const query = nearInput.trim();
    const nextState: Partial<typeof state> = { page: 1, radius_km: normalizeSearchRadiusKm(state.radius_km) };
    setLocationMessage(null);

    if (query.toLowerCase() === "current location" && state.lat != null && state.lng != null) {
      nextState.loc = "Current location";
    } else if (query) {
      const preset = resolveNear(query);
      if (preset) {
        const key = Object.entries(PRESET_LOCATIONS).find(([, p]) => p.label === preset.label)?.[0]
          ?? query.toLowerCase();
        nextState.loc = key;
        nextState.lat = null;
        nextState.lng = null;
      } else {
        setResolvingNear(true);
        let place: GeocodeSuggestion | null = null;
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
    } else {
      nextState.loc = "";
      nextState.lat = null;
      nextState.lng = null;
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
          let endPlace: GeocodeSuggestion | null = null;
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
    try {
      setState(nextState);
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
        setState({
          loc: "Current location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
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

  // Fetch when searchKey changes. We rebuild the URL params off of *state*
  // at request time so the user can prep filters then hit Search.
  useEffect(() => {
    if (searchKey === 0) return;
    const searchNights = rangeNights(state.start_date, state.end_date);
    if (state.stay_mode !== "same_site" && (!searchNights || searchNights < 2)) {
      setData({ results: [], total: 0, group_total: 0, groups: [], freshness_p50_minutes: 0 });
      setLoading(false);
      return;
    }
    const sp = new URLSearchParams();
    if (effectiveAnchor) {
      sp.set("lat", String(effectiveAnchor.lat));
      sp.set("lng", String(effectiveAnchor.lng));
    }
    if (state.stay_mode === "anywhere" && state.end_lat != null && state.end_lng != null) {
      sp.set("end_lat", String(state.end_lat));
      sp.set("end_lng", String(state.end_lng));
    }
    sp.set("radius_km", String(normalizeSearchRadiusKm(state.radius_km)));
    if (state.start_date) sp.set("start_date", state.start_date);
    if (state.end_date) sp.set("end_date", state.end_date);
    if (state.flexible) sp.set("flexible", "true");
    if (state.min_nights) sp.set("min_nights", String(state.min_nights));
    if (state.party_size) sp.set("party_size", String(state.party_size));
    if (state.equipment && state.equipment !== "any") sp.set("equipment", state.equipment);
    if (state.equipment_length_ft) sp.set("equipment_length_ft", String(state.equipment_length_ft));
    if (state.site_types.length) sp.set("site_types", state.site_types.join(","));
    if (state.amenities.length) sp.set("amenities", state.amenities.join(","));
    if (state.operators.length) sp.set("operators", state.operators.join(","));
    if (state.park_slugs.length) sp.set("park_slugs", state.park_slugs.join(","));
    sp.set("stay_mode", state.stay_mode);
    sp.set("sort", state.sort);
    if (state.group_by === "none") {
      sp.set("group_by", "none");
      sp.set("limit", String(RAW_RESULTS_PER_PAGE));
      sp.set("offset", String((Math.max(1, state.page) - 1) * RAW_RESULTS_PER_PAGE));
    } else {
      sp.set("group_by", state.group_by);
      sp.set("group_limit", String(GROUPS_PER_PAGE));
      sp.set("group_offset", String((Math.max(1, state.page) - 1) * GROUPS_PER_PAGE));
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

  function addParkFilter(park: ParkSummary) {
    if (state.park_slugs.includes(park.slug)) return;
    setState({ park_slugs: [...state.park_slugs, park.slug], page: 1 });
    setParkInput("");
  }

  function removeParkFilter(slug: string) {
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
    await setState({ page: Math.max(1, page) });
    setSearchKey((k) => k + 1);
  }

  function setFlexibleDates(next: boolean) {
    const windowNights = rangeNights(state.start_date, state.end_date);
    const minRouteNights = state.stay_mode === "same_site" ? 1 : 2;
    const defaultNights = Math.max(minRouteNights, Math.min(windowNights ?? 2, 2));
    setState({
      flexible: next,
      min_nights: next ? (state.min_nights ?? defaultNights) : null,
    });
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
  const advancedFilterCount = state.site_types.length + state.amenities.length + state.operators.length;
  const resultWord = state.stay_mode === "same_site" ? "sites" : "routes";
  const groupedMode = state.group_by !== "none";
  const groupedResults = useMemo(
    () => (data?.groups ? data.groups : data ? groupResults(data.results, state.group_by) : []),
    [data, state.group_by],
  );
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
                disabled={loading || resolvingNear}
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
                {selectedParks.map((park) => (
                  <span key={park.slug} className="chip max-w-[10rem] shrink-0 bg-white text-stone-700 ring-1 ring-stone-200">
                    <span className="truncate">{park.name}</span>
                  </span>
                ))}
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
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-[minmax(15rem,1.05fr)_minmax(17rem,1.25fr)_minmax(8.5rem,0.65fr)_minmax(8.5rem,0.65fr)_minmax(11rem,0.75fr)_auto]">
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
                  onChange={(e) => setNearInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runSearch();
                    }
                  }}
                />
              </div>

              <div className="relative col-span-2 rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600 sm:col-span-3 lg:col-span-1 lg:min-w-0">
                <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  <Search size={12} /> Park filter
                </label>
                <input
                  type="text"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none placeholder:text-stone-400"
                  placeholder={selectedParks.length ? "Add another park" : "Search any park"}
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
                          <span className="block truncate text-xs text-stone-500">{park.operator} · {park.region}</span>
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
              </div>

              <div className="col-span-2 rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600 sm:col-span-1">
                <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  <Calendar size={12} /> Check-in
                </label>
                <input
                  type="date"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                  value={state.start_date}
                  onChange={(e) => setState({ start_date: e.target.value, page: 1 })}
                />
              </div>

              <div className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600">
                <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  <Calendar size={12} /> Check-out
                </label>
                <input
                  type="date"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                  value={state.end_date}
                  onChange={(e) => setState({ end_date: e.target.value, page: 1 })}
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
                disabled={loading || resolvingNear}
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

            {selectedParks.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5 border-t border-stone-100 pt-1.5">
                {selectedParks.map((park) => (
                  <span
                    key={park.slug}
                    className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full bg-forest-50 px-2.5 py-1 text-xs font-semibold text-forest-800 ring-1 ring-forest-200"
                  >
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{park.name}</span>
                    <button
                      type="button"
                      onClick={() => removeParkFilter(park.slug)}
                      className="rounded-full p-0.5 text-forest-700 transition hover:bg-forest-100"
                      aria-label={`Remove ${park.name}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

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
                      value={state.radius_km}
                      onChange={(e) => setState({ radius_km: Number(e.target.value), page: 1 })}
                      onBlur={(e) => setState({ radius_km: normalizeSearchRadiusKm(e.currentTarget.value), page: 1 })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void setState({ radius_km: normalizeSearchRadiusKm(e.currentTarget.value), page: 1 }).then(() => runSearch());
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
                    type="number"
                    min={minRouteNights}
                    max={dateWindowNights ?? 21}
                    className="w-11 bg-transparent text-right outline-none"
                    value={Math.max(minRouteNights, state.min_nights ?? dateWindowNights ?? minRouteNights)}
                    onChange={(e) => setState({ min_nights: Math.max(minRouteNights, Number(e.target.value)), flexible: true, page: 1 })}
                  />
                </label>
                <label className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                  <span>Party</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className="w-10 bg-transparent text-right outline-none"
                    value={state.party_size}
                    onChange={(e) => setState({ party_size: Number(e.target.value), page: 1 })}
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
                      {advancedFilterCount ? `${advancedFilterCount} active` : "Types, amenities, operators"}
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
                  {Object.entries(AMENITIES).slice(0, 6).map(([code, a]) => (
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
                  <span className="h-4 w-px shrink-0 bg-stone-300" />
                  {OPERATOR_OPTIONS.map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => setState({ operators: toggle(state.operators, op.id), page: 1 })}
                      className={`chip shrink-0 ring-1 ${
                        state.operators.includes(op.id)
                          ? "bg-stone-900 text-white ring-stone-900"
                          : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {locationMessage && (
            <div className="mt-1 text-xs text-stone-500">{locationMessage}</div>
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
                  <label className="min-w-0 rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 focus-within:bg-white focus-within:ring-forest-600">
                    <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      <MapPin size={12} /> Near
                    </span>
                    <input
                      type="text"
                      className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none placeholder:text-stone-400"
                      placeholder="Town, city, park, or postal code"
                      value={nearInput}
                      autoComplete="off"
                      onChange={(e) => setNearInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setMobileFiltersOpen(false);
                          void runSearch();
                        }
                      }}
                    />
                  </label>
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
                    <Search size={12} /> Park filter
                  </label>
                  <input
                    type="text"
                    className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none placeholder:text-stone-400"
                    placeholder={selectedParks.length ? "Add another park" : "Search any park"}
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
                            <span className="block truncate text-xs text-stone-500">{park.operator} · {park.region}</span>
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
                </div>

                {selectedParks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedParks.map((park) => (
                      <span
                        key={park.slug}
                        className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full bg-forest-50 px-2.5 py-1 text-xs font-semibold text-forest-800 ring-1 ring-forest-200"
                      >
                        <MapPin size={12} className="shrink-0" />
                        <span className="truncate">{park.name}</span>
                        <button
                          type="button"
                          onClick={() => removeParkFilter(park.slug)}
                          className="rounded-full p-0.5 text-forest-700 transition hover:bg-forest-100"
                          aria-label={`Remove ${park.name}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 focus-within:bg-white focus-within:ring-forest-600">
                    <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      <Calendar size={12} /> Check-in
                    </span>
                    <input
                      type="date"
                      className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                      value={state.start_date}
                      onChange={(e) => setState({ start_date: e.target.value, page: 1 })}
                    />
                  </label>
                  <label className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 focus-within:bg-white focus-within:ring-forest-600">
                    <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      <Calendar size={12} /> Check-out
                    </span>
                    <input
                      type="date"
                      className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                      value={state.end_date}
                      onChange={(e) => setState({ end_date: e.target.value, page: 1 })}
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
                        value={state.radius_km}
                        onChange={(e) => setState({ radius_km: Number(e.target.value), page: 1 })}
                        onBlur={(e) => setState({ radius_km: normalizeSearchRadiusKm(e.currentTarget.value), page: 1 })}
                      />
                      <span className="text-stone-500">km</span>
                    </span>
                  </label>
                  <label className="rounded-md bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                    <span className="block text-stone-500">Party</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className="mt-1 w-full bg-transparent text-sm text-stone-950 outline-none"
                      value={state.party_size}
                      onChange={(e) => setState({ party_size: Number(e.target.value), page: 1 })}
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
                      type="number"
                      min={minRouteNights}
                      max={dateWindowNights ?? 21}
                      className="min-w-0 flex-1 bg-transparent text-right outline-none"
                      value={Math.max(minRouteNights, state.min_nights ?? dateWindowNights ?? minRouteNights)}
                      onChange={(e) => setState({ min_nights: Math.max(minRouteNights, Number(e.target.value)), flexible: true, page: 1 })}
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
                <div className="flex flex-wrap gap-1.5">
                  {OPERATOR_OPTIONS.map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => setState({ operators: toggle(state.operators, op.id), page: 1 })}
                      className={`chip ring-1 ${
                        state.operators.includes(op.id)
                          ? "bg-stone-900 text-white ring-stone-900"
                          : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <div className="absolute inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
              <button
                type="button"
                className="btn-primary h-11 w-full text-sm font-semibold"
                onClick={() => {
                  setMobileFiltersOpen(false);
                  void runSearch();
                }}
                disabled={loading || resolvingNear}
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
                <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
                  No availability matches your filters. Try expanding the radius, allowing moves, or easing site filters.
                </div>
              )}
              {data && data.total > 0 && groupedMode && groupedResults.length === 0 && !loading && (
                <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
                  No groups on this page.
                </div>
              )}
              {!data && !loading && !routeNeedsDates && (
                <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
                  Type a location, choose dates and equipment, then search. Results land here with map context beside them.
                </div>
              )}
              {groupedMode ? groupedResults.map((group) => (
                <details key={group.key} className="group overflow-hidden rounded-lg bg-stone-50 ring-1 ring-stone-200">
                  <summary className="cursor-pointer list-none transition hover:bg-white">
                    {state.group_by === "park" && group.hero_image_url && (
                      <div className="relative h-8 overflow-hidden bg-stone-200 sm:h-9">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={group.hero_image_url}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
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
                          {group.distance != null ? ` · ${group.distance.toFixed(0)} km away` : ""}
                        </div>
                      </div>
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-stone-600 ring-1 ring-stone-200">
                        {group.result_count.toLocaleString()}
                      </span>
                    </div>
                  </summary>
                  <div className="space-y-2 border-t border-stone-200 p-2">
                    {group.results.map((r, index) => (
                      <ResultCard
                        key={`${r.site.id}-${r.availability.nights.join("-")}-${r.stay?.mode ?? "single"}-${index}`}
                        result={r}
                        onOpenResult={openResult}
                        onOpenSiteDetails={openSiteDetails}
                        loadingSiteId={loadingSiteId}
                      />
                    ))}
                    {group.result_count > group.results.length && (
                      <div className="rounded-md bg-white px-3 py-2 text-xs text-stone-500 ring-1 ring-stone-200">
                        Showing first {group.results.length} results in this group. Refine filters to narrow it further.
                      </div>
                    )}
                  </div>
                </details>
              )) : data?.results.map((r, index) => (
                <ResultCard
                  key={`${r.site.id}-${r.availability.nights.join("-")}-${r.stay?.mode ?? "single"}-${index}`}
                  result={r}
                  onOpenResult={openResult}
                  onOpenSiteDetails={openSiteDetails}
                  loadingSiteId={loadingSiteId}
                />
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
              parks={mapParks}
              anchor={effectiveAnchor}
              radiusKm={state.radius_km}
              matchedSlugs={matchedSlugs}
            />
          </section>
        </div>
      </div>

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
