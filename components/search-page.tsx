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
import { Loader2, MapPin, Calendar, Sliders, Search } from "lucide-react";
import { SEARCH_EQUIPMENT_OPTIONS, searchEquipmentById } from "@/lib/search-equipment";

const SITE_TYPES = ["tent", "rv", "cabin", "yurt"] as const;
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
  const [allParks, setAllParks] = useState<ParkSummary[]>([]);
  // `searchKey` bumps every time the user explicitly hits Search.
  // The fetch effect depends on it, NOT on filter state — so changing a chip
  // doesn't auto-fire a query.
  const [searchKey, setSearchKey] = useState(0);

  // Kick off shareable /search URLs after hydration. A useState initializer
  // would see no `window` during the server render and miss these params.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has("lat") || sp.has("loc") || sp.has("start_date") || sp.has("end_date") || sp.has("equipment")) {
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
    const preset = resolveNear(query);
    if (preset) {
      // Find the key that maps to this preset
      const key = Object.entries(PRESET_LOCATIONS).find(([, p]) => p.label === preset.label)?.[0]
        ?? query.toLowerCase();
      setState({ loc: key, lat: null, lng: null });
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
        setState({ loc: place.label, lat: place.lat, lng: place.lng });
      } else {
        setState({ loc: query, lat: null, lng: null });
      }
    } else {
      setState({ loc: "", lat: null, lng: null });
    }
    setSearchKey((k) => k + 1);
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

  // Slugs of parks that have at least one site in the current search results.
  const matchedSlugs = useMemo<Set<string> | null>(() => {
    if (!data) return null;
    const s = new Set<string>();
    for (const r of data.results) s.add(r.park.slug);
    return s;
  }, [data]);

  return (
    <div className="bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-[minmax(12rem,1.25fr)_0.85fr_0.85fr_0.95fr_0.7fr_0.75fr_auto]">
          <div className="flex flex-col col-span-2 sm:col-span-1">
            <label className="label flex items-center gap-1.5"><MapPin size={12} /> Near</label>
            <input
              type="text"
              className="field"
              placeholder="City, region, or town"
              value={nearInput}
              onChange={(e) => setNearInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
            />
          </div>
          <div className="flex flex-col">
            <label className="label flex items-center gap-1.5"><Calendar size={12} /> Check-in</label>
            <input
              type="date"
              className="field"
              value={state.start_date}
              onChange={(e) => setState({ start_date: e.target.value })}
            />
          </div>
          <div className="flex flex-col">
            <label className="label flex items-center gap-1.5"><Calendar size={12} /> Check-out</label>
            <input
              type="date"
              className="field"
              value={state.end_date}
              onChange={(e) => setState({ end_date: e.target.value })}
            />
          </div>
          <div className="flex flex-col">
            <label className="label">Equipment</label>
            <select
              className="field"
              value={state.equipment}
              onChange={(e) => applyEquipment(e.target.value)}
            >
              {SEARCH_EQUIPMENT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="label">Within (km)</label>
            <input
              type="number"
              className="field"
              min={10}
              max={500}
              step={10}
              value={state.radius_km}
              onChange={(e) => setState({ radius_km: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col">
            <label className="label">Sort by</label>
            <select
              className="field"
              value={state.sort}
              onChange={(e) => setState({ sort: e.target.value as typeof state.sort })}
            >
              <option value="distance">Distance</option>
              <option value="freshness">Freshness</option>
              <option value="price">Price</option>
              <option value="name">Park name</option>
            </select>
          </div>
          <div className="flex flex-col col-span-2 sm:col-span-1">
            <label className="label invisible sm:visible">Run</label>
            <button
              className="btn-primary justify-center"
              onClick={runSearch}
              disabled={loading || resolvingNear}
            >
              {loading || resolvingNear ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Searching…
                </>
              ) : (
                <>
                  <Search size={14} /> Search
                </>
              )}
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-stone-500 flex items-center gap-1">
            <Sliders size={12} /> Filters:
          </span>
          <label className="chip ring-1 ring-stone-300 cursor-pointer hover:bg-stone-50">
            <input
              type="checkbox"
              className="accent-forest-700"
              checked={state.flexible}
              onChange={(e) => setState({ flexible: e.target.checked })}
            />
            Flexible dates
          </label>
          {SITE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setState({
                site_types: toggle(state.site_types, t),
                equipment: "any",
                equipment_length_ft: null,
              })}
              className={`chip ring-1 ${
                state.site_types.includes(t)
                  ? "bg-forest-700 text-white ring-forest-700"
                  : "ring-stone-300 text-stone-700 hover:bg-stone-50"
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
          <span className="mx-2 h-4 w-px bg-stone-300" />
          {Object.entries(AMENITIES).slice(0, 6).map(([code, a]) => (
            <button
              key={code}
              onClick={() => setState({ amenities: toggle(state.amenities, code) })}
              className={`chip ring-1 ${
                state.amenities.includes(code)
                  ? "bg-lake-700 text-white ring-lake-700"
                  : "ring-stone-300 text-stone-700 hover:bg-stone-50"
              }`}
            >
              {a.label}
            </button>
          ))}
          <span className="mx-2 h-4 w-px bg-stone-300" />
          {OPERATOR_OPTIONS.map((op) => (
            <button
              key={op.id}
              onClick={() => setState({ operators: toggle(state.operators, op.id) })}
              className={`chip ring-1 ${
                state.operators.includes(op.id)
                  ? "bg-stone-900 text-white ring-stone-900"
                  : "ring-stone-300 text-stone-700 hover:bg-stone-50"
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between mb-3 text-sm text-stone-600">
          <div>
            {loading ? (
              <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Searching…</span>
            ) : data ? (
              <>
                <span className="font-semibold text-stone-900">{data.total.toLocaleString()}</span> available
                {data.total > (data.results.length ?? 0) ? ` (showing ${data.results.length})` : ""}
                {" "}· median freshness {data.freshness_p50_minutes}m
              </>
            ) : (
              <span className="text-stone-500">
                Set your filters and hit <span className="font-semibold text-stone-700">Search</span> when ready.
              </span>
            )}
          </div>
        </div>

        {/* Mobile: map on top (h-72), then list. Desktop: side-by-side with sticky map. */}
        <div className="lg:hidden mb-3 h-72">
          <ParkMap
            anchor={effectiveAnchor}
            radiusKm={state.radius_km}
            allParks={allParks}
            matchedSlugs={matchedSlugs}
          />
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
          <div className="space-y-3">
            {data?.results.length === 0 && !loading && (
              <div className="card p-8 text-center text-stone-600">
                No availability matches your filters. Try expanding radius or unchecking site-type filters.
              </div>
            )}
            {!data && !loading && (
              <div className="card p-8 text-center text-stone-500">
                Type a location, pick dates if you want, then hit Search. Results land here.
              </div>
            )}
            {data?.results.map((r) => <ResultCard key={r.site.id} result={r} />)}
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-[60px] h-[calc(100vh-72px)]">
              <ParkMap
                anchor={effectiveAnchor}
                radiusKm={state.radius_km}
                allParks={allParks}
                matchedSlugs={matchedSlugs}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
