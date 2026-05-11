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
import { Loader2, MapPin, Calendar, Sliders } from "lucide-react";

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
];
const SORT_OPTIONS = ["distance", "freshness", "name", "price"] as const;

export function SearchPage() {
  const [state, setState] = useQueryStates({
    loc: parseAsString.withDefault("toronto"),
    lat: parseAsFloat,
    lng: parseAsFloat,
    radius_km: parseAsInteger.withDefault(150),
    start_date: parseAsString.withDefault(""),
    end_date: parseAsString.withDefault(""),
    flexible: parseAsBoolean.withDefault(false),
    min_nights: parseAsInteger,
    party_size: parseAsInteger.withDefault(2),
    site_types: parseAsArrayOf(parseAsString).withDefault([]),
    amenities: parseAsArrayOf(parseAsString).withDefault([]),
    operators: parseAsArrayOf(parseAsString).withDefault([]),
    sort: parseAsStringLiteral(SORT_OPTIONS).withDefault("distance"),
  });

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [allParks, setAllParks] = useState<ParkSummary[]>([]);

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

  // Resolve lat/lng from loc preset if missing
  const effectiveAnchor = useMemo(() => {
    if (state.lat != null && state.lng != null) return { lat: state.lat, lng: state.lng };
    if (state.loc && PRESET_LOCATIONS[state.loc]) {
      const p = PRESET_LOCATIONS[state.loc];
      return { lat: p.lat, lng: p.lng };
    }
    return null;
  }, [state.lat, state.lng, state.loc]);

  // Build query string and fetch
  useEffect(() => {
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
  }, [
    effectiveAnchor,
    state.radius_km,
    state.start_date,
    state.end_date,
    state.flexible,
    state.min_nights,
    state.party_size,
    state.site_types,
    state.amenities,
    state.operators,
    state.sort,
  ]);

  function toggle<T extends string>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  // Slugs of parks that have at least one site in the current search results.
  // Null until the first search completes, so the map shows every pin full
  // brightness on initial load instead of dimming everything.
  const matchedSlugs = useMemo<Set<string> | null>(() => {
    if (!data) return null;
    const s = new Set<string>();
    for (const r of data.results) s.add(r.park.slug);
    return s;
  }, [data]);

  return (
    <div className="bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 grid gap-2 lg:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr_auto]">
          <div className="flex flex-col">
            <label className="label flex items-center gap-1.5"><MapPin size={12} /> Near</label>
            <select
              className="field"
              value={state.loc}
              onChange={(e) => setState({ loc: e.target.value, lat: null, lng: null })}
            >
              {Object.entries(PRESET_LOCATIONS).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </select>
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
          <div className="flex flex-col">
            <label className="label invisible">Reset</label>
            <button
              className="btn-secondary"
              onClick={() =>
                setState({
                  start_date: "",
                  end_date: "",
                  flexible: false,
                  min_nights: null,
                  site_types: [],
                  amenities: [],
                  operators: [],
                })
              }
            >
              Reset
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
              onClick={() => setState({ site_types: toggle(state.site_types, t) })}
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
            ) : null}
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
