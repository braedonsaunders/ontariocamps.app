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
import { AMENITIES, type SearchResponse } from "@/lib/types";
import { ResultCard } from "@/components/result-card";
import { ParkMap, type ParkSummary } from "@/components/park-map";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  Home,
  List,
  Loader2,
  LocateFixed,
  Map,
  MapPin,
  Navigation,
  Route,
  Ruler,
  Search,
  Sliders,
  Tent,
  Truck,
} from "lucide-react";
import { SEARCH_EQUIPMENT_OPTIONS, searchEquipmentById } from "@/lib/search-equipment";

const SITE_TYPES = ["tent", "rv", "cabin", "yurt"] as const;
const STAY_MODES = ["same_site", "same_park", "anywhere"] as const;
const VIEW_MODES = ["list", "map"] as const;
const OPERATOR_OPTIONS: { id: string; label: string }[] = [
  { id: "ontario_parks", label: "Ontario Parks" },
  { id: "parks_canada", label: "Parks Canada" },
  { id: "gtc_lprca", label: "Long Point CA" },
  { id: "gtc_stclair", label: "St. Clair CA" },
  { id: "gtc_grca", label: "Grand River CA" },
  { id: "gtc_trca", label: "Toronto & Region CA" },
  { id: "gtc_npca", label: "Niagara Peninsula CA" },
  { id: "gtc_otonabee", label: "Otonabee CA" },
  { id: "gtc_upperthames", label: "Upper Thames CA" },
  { id: "gtc_maitland", label: "Maitland Valley CA" },
  { id: "gtc_catfish", label: "Catfish Creek CA" },
];
const SORT_OPTIONS = ["distance", "freshness", "name", "price"] as const;

const STAY_MODE_OPTIONS: {
  id: (typeof STAY_MODES)[number];
  label: string;
  detail: string;
}[] = [
  { id: "same_site", label: "Same site", detail: "One campsite for the full stay" },
  { id: "same_park", label: "Same park", detail: "Move sites without changing parks" },
  { id: "anywhere", label: "Nightly route", detail: "Move across parks by night" },
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

function stayModeCopy(mode: (typeof STAY_MODES)[number]) {
  return STAY_MODE_OPTIONS.find((option) => option.id === mode) ?? STAY_MODE_OPTIONS[0];
}

export function SearchPage() {
  const [state, setState] = useQueryStates({
    loc: parseAsString.withDefault(""),
    lat: parseAsFloat,
    lng: parseAsFloat,
    radius_km: parseAsInteger.withDefault(150),
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
    stay_mode: parseAsStringLiteral(STAY_MODES).withDefault("same_site"),
    view: parseAsStringLiteral(VIEW_MODES).withDefault("list"),
    sort: parseAsStringLiteral(SORT_OPTIONS).withDefault("distance"),
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

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvingNear, setResolvingNear] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [allParks, setAllParks] = useState<ParkSummary[]>([]);
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
      sp.has("equipment") ||
      sp.has("stay_mode")
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
    // Commit the typed "near" string into state. If we can resolve it to a
    // preset, store the canonical preset key + clear lat/lng. Otherwise just
    // store the raw typed value for the URL.
    const query = nearInput.trim();
    setLocationMessage(null);
    const preset = resolveNear(query);
    if (preset) {
      // Find the key that maps to this preset
      const key = Object.entries(PRESET_LOCATIONS).find(([, p]) => p.label === preset.label)?.[0]
        ?? query.toLowerCase();
      await setState({ loc: key, lat: null, lng: null });
    } else if (query) {
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
        await setState({ loc: place.label, lat: place.lat, lng: place.lng });
      } else {
        await setState({ loc: query, lat: null, lng: null });
        setLocationMessage("Showing Ontario-wide results until this place can be resolved.");
      }
    } else {
      await setState({ loc: "", lat: null, lng: null });
    }
    setSearchKey((k) => k + 1);
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
    const sp = new URLSearchParams();
    if (effectiveAnchor) {
      sp.set("lat", String(effectiveAnchor.lat));
      sp.set("lng", String(effectiveAnchor.lng));
    }
    sp.set("radius_km", String(state.radius_km));
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
    sp.set("stay_mode", state.stay_mode);
    sp.set("sort", state.sort);
    sp.set("limit", "60");

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
    });
  }

  function setFlexibleDates(next: boolean) {
    const windowNights = rangeNights(state.start_date, state.end_date);
    const defaultNights = Math.max(1, Math.min(windowNights ?? 2, 2));
    setState({
      flexible: next,
      min_nights: next ? (state.min_nights ?? defaultNights) : null,
    });
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
  const activeFilterCount =
    state.site_types.length +
    state.amenities.length +
    state.operators.length +
    (state.flexible ? 1 : 0);
  const resultWord = state.stay_mode === "same_site" ? "sites" : "routes";

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[42rem] flex-col bg-stone-50">
      <div className="sticky top-14 z-40 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-2 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-white p-1.5 ring-1 ring-stone-200">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-[minmax(17rem,1.45fr)_minmax(8.5rem,0.7fr)_minmax(8.5rem,0.7fr)_minmax(12rem,0.95fr)_minmax(7rem,0.55fr)_minmax(8rem,0.65fr)_auto]">
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

              <div className="col-span-2 rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600 sm:col-span-1">
                <label className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  <Calendar size={12} /> Check-in
                </label>
                <input
                  type="date"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                  value={state.start_date}
                  onChange={(e) => setState({ start_date: e.target.value })}
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
                  onChange={(e) => setState({ end_date: e.target.value })}
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

              <div className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600">
                <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Radius
                </label>
                <input
                  type="number"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
                  min={10}
                  max={500}
                  step={10}
                  value={state.radius_km}
                  onChange={(e) => setState({ radius_km: Number(e.target.value) })}
                />
              </div>

              <div className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600">
                <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Sort
                </label>
                <select
                  className="w-full min-w-0 appearance-none bg-transparent text-sm font-semibold text-stone-950 outline-none"
                  value={state.sort}
                  onChange={(e) => setState({ sort: e.target.value as typeof state.sort })}
                >
                  <option value="distance">Distance</option>
                  <option value="freshness">Freshness</option>
                  <option value="price">Price</option>
                  <option value="name">Park name</option>
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

            <div className="mt-1.5 grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_auto]">
              <div className="grid grid-cols-3 gap-1.5">
                {STAY_MODE_OPTIONS.map((option) => {
                  const active = state.stay_mode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setState({ stay_mode: option.id })}
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

              <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-stone-50 p-1.5 ring-1 ring-stone-200">
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
                    min={1}
                    max={dateWindowNights ?? 21}
                    className="w-11 bg-transparent text-right outline-none"
                    value={state.min_nights ?? dateWindowNights ?? 1}
                    onChange={(e) => setState({ min_nights: Number(e.target.value), flexible: true })}
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
                    onChange={(e) => setState({ party_size: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-stone-500">
              <Sliders size={12} /> Filters {activeFilterCount ? `(${activeFilterCount})` : ""}
            </span>
            {SITE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setState({
                  site_types: toggle(state.site_types, t),
                  equipment: "any",
                  equipment_length_ft: null,
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
                onClick={() => setState({ amenities: toggle(state.amenities, code) })}
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
                onClick={() => setState({ operators: toggle(state.operators, op.id) })}
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

          <div className="mt-2 flex items-center justify-between gap-2 lg:hidden">
            <div className="text-xs text-stone-500">
              {selectedStayMode.label}
              {dateWindowNights ? ` · ${dateWindowNights} night window` : ""}
            </div>
            <div className="inline-flex rounded-md bg-stone-100 p-1 ring-1 ring-stone-200">
              {VIEW_MODES.map((mode) => {
                const Icon = mode === "list" ? List : Map;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setState({ view: mode })}
                    className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-semibold capitalize ${
                      state.view === mode ? "bg-white text-stone-950 shadow-sm" : "text-stone-600"
                    }`}
                  >
                    <Icon size={13} /> {mode}
                  </button>
                );
              })}
            </div>
          </div>

          {locationMessage && (
            <div className="mt-1 text-xs text-stone-500">{locationMessage}</div>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 px-4 py-3 sm:px-6 lg:px-8">
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
                      {data.total > data.results.length ? (
                        <span className="text-stone-400"> / showing {data.results.length}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-stone-500">Ready</span>
                  )}
                </div>
              </div>
              {data && !loading && (
                <div className="mt-2 text-xs text-stone-500">
                  Median freshness {data.freshness_p50_minutes}m
                </div>
              )}
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {data?.results.length === 0 && !loading && (
                <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
                  No availability matches your filters. Try expanding the radius, allowing moves, or easing site filters.
                </div>
              )}
              {!data && !loading && (
                <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-500">
                  Type a location, choose dates and equipment, then search. Results land here with map context beside them.
                </div>
              )}
              {data?.results.map((r, index) => (
                <ResultCard
                  key={`${r.site.id}-${r.availability.nights.join("-")}-${r.stay?.mode ?? "single"}-${index}`}
                  result={r}
                />
              ))}
            </div>
          </section>

          <section
            className={`min-h-0 overflow-hidden rounded-lg bg-white ring-1 ring-stone-200 ${
              state.view === "list" ? "hidden lg:block" : "block"
            }`}
          >
            <ParkMap
              anchor={effectiveAnchor}
              radiusKm={state.radius_km}
              allParks={allParks}
              matchedSlugs={matchedSlugs}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
