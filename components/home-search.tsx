"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  Check,
  ChevronDown,
  Home,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Ruler,
  Search as SearchIcon,
  Tent,
  Truck,
} from "lucide-react";
import {
  SEARCH_EQUIPMENT_OPTIONS,
  searchEquipmentById,
  type SearchEquipmentId,
} from "@/lib/search-equipment";
import {
  DEFAULT_SEARCH_RADIUS_KM,
  MAX_SEARCH_RADIUS_KM,
  MIN_SEARCH_RADIUS_KM,
  normalizeSearchRadiusKm,
} from "@/lib/search-radius";

type PlaceSuggestion = {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
  type: string;
};

type GeocodeResponse = {
  suggestions?: PlaceSuggestion[];
};

const EQUIPMENT_ICONS: Record<SearchEquipmentId, LucideIcon> = {
  any: Navigation,
  tent: Tent,
  small_rv: Truck,
  rv: Truck,
  large_rv: Ruler,
  roofed: Home,
};

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function geocode(query: string, signal?: AbortSignal) {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) return [];
  const data = (await response.json()) as GeocodeResponse;
  return data.suggestions ?? [];
}

export function HomeSearch() {
  const router = useRouter();
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeMessage, setPlaceMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [equipment, setEquipment] = useState<SearchEquipmentId>("tent");
  const [start, setStart] = useState(todayPlus(30));
  const [end, setEnd] = useState(todayPlus(33));
  const [radius, setRadius] = useState(DEFAULT_SEARCH_RADIUS_KM);

  const selectedEquipment = useMemo(() => searchEquipmentById(equipment), [equipment]);
  const EquipmentIcon = EQUIPMENT_ICONS[selectedEquipment.id];

  useEffect(() => {
    const query = locationQuery.trim();
    setPlaceMessage(null);

    if (selectedPlace && query === selectedPlace.label) return;
    if (query.length < 3) {
      setSuggestions([]);
      setPlaceLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPlaceLoading(true);
      try {
        const nextSuggestions = await geocode(query, controller.signal);
        setSuggestions(nextSuggestions);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        setPlaceLoading(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locationQuery, selectedPlace]);

  function selectPlace(place: PlaceSuggestion) {
    setSelectedPlace(place);
    setLocationQuery(place.label);
    setSuggestions([]);
    setPlaceOpen(false);
    setPlaceMessage(null);
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setPlaceMessage("Location is unavailable in this browser.");
      return;
    }

    setLocating(true);
    setPlaceMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        selectPlace({
          id: "device-location",
          label: "Current location",
          detail: "Device location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          type: "device",
        });
        setLocating(false);
      },
      () => {
        setPlaceMessage("Location permission was not granted.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60 * 1000 },
    );
  }

  async function resolvePlaceForSubmit() {
    const query = locationQuery.trim();
    if (selectedPlace && (query === selectedPlace.label || selectedPlace.id === "device-location")) {
      return selectedPlace;
    }
    if (!query) return null;

    setPlaceLoading(true);
    let matches: PlaceSuggestion[] = [];
    try {
      matches = await geocode(query);
    } catch {
      setPlaceMessage("Place lookup is unavailable.");
      setPlaceOpen(true);
      return null;
    } finally {
      setPlaceLoading(false);
    }
    const match = matches[0];
    if (match) {
      selectPlace(match);
      return match;
    }

    setPlaceMessage("No Ontario match found.");
    setPlaceOpen(true);
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const place = await resolvePlaceForSubmit();
    if (locationQuery.trim() && !place) return;

    const sp = new URLSearchParams();
    if (place) {
      sp.set("lat", String(place.lat));
      sp.set("lng", String(place.lng));
      sp.set("loc", place.label);
    }

    sp.set("radius_km", String(normalizeSearchRadiusKm(radius)));
    sp.set("start_date", start);
    sp.set("end_date", end);
    sp.set("equipment", selectedEquipment.id);
    if (selectedEquipment.siteTypes.length > 0) {
      sp.set("site_types", selectedEquipment.siteTypes.join(","));
    }
    if (selectedEquipment.equipmentLengthFt) {
      sp.set("equipment_length_ft", String(selectedEquipment.equipmentLengthFt));
    }

    router.push(`/search?${sp.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="relative z-[60] rounded-lg bg-white p-1.5 text-stone-900 shadow-2xl shadow-black/25 ring-1 ring-white/70 sm:p-2"
    >
      <div className="grid gap-1.5 lg:grid-cols-[minmax(18rem,1.45fr)_minmax(9rem,0.75fr)_minmax(9rem,0.75fr)_minmax(12rem,0.95fr)_minmax(8rem,0.65fr)_auto]">
        <div className="relative rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600">
          <div className="mb-0.5 flex items-center justify-between gap-3">
            <label htmlFor="home-location" className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              <MapPin size={12} /> Near
            </label>
            <button
              type="button"
              onClick={useDeviceLocation}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-forest-700 ring-1 ring-stone-200 transition hover:bg-forest-50"
            >
              {locating ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />}
              <span>Use location</span>
            </button>
          </div>
          <input
            id="home-location"
            type="text"
            className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none placeholder:text-stone-400"
            placeholder="Town, city, park, or postal code"
            value={locationQuery}
            autoComplete="off"
            onChange={(e) => {
              setLocationQuery(e.target.value);
              if (selectedPlace && e.target.value !== selectedPlace.label) setSelectedPlace(null);
            }}
            onFocus={() => setPlaceOpen(true)}
            onBlur={() => window.setTimeout(() => setPlaceOpen(false), 120)}
          />

          {placeOpen && (placeLoading || placeMessage || suggestions.length > 0) && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-[90] overflow-hidden rounded-lg bg-white p-1.5 shadow-2xl ring-1 ring-stone-200">
              {placeLoading && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-stone-500">
                  <Loader2 size={14} className="animate-spin" />
                  Finding places
                </div>
              )}
              {!placeLoading && placeMessage && (
                <div className="px-3 py-2 text-sm text-stone-500">{placeMessage}</div>
              )}
              {!placeLoading && suggestions.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectPlace(place)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-forest-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-100 text-forest-700">
                    <MapPin size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-stone-900">{place.label}</span>
                    <span className="block truncate text-xs text-stone-500">{place.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600">
          <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            <Calendar size={12} /> Arrive
          </span>
          <input
            type="date"
            className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none [color-scheme:light]"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>

        <label className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600">
          <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            <Calendar size={12} /> Leave
          </span>
          <input
            type="date"
            className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none [color-scheme:light]"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>

        <div className="relative rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200">
          <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            <EquipmentIcon size={12} /> Equipment
          </span>
          <button
            type="button"
            aria-expanded={equipmentOpen}
            onClick={() => setEquipmentOpen((open) => !open)}
            onBlur={() => window.setTimeout(() => setEquipmentOpen(false), 120)}
            className="flex w-full min-w-0 items-center justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-stone-950">{selectedEquipment.label}</span>
              <span className="block truncate text-[11px] leading-4 text-stone-500">{selectedEquipment.description}</span>
            </span>
            <ChevronDown size={16} className="shrink-0 text-stone-400" />
          </button>
          {equipmentOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-[90] overflow-hidden rounded-lg bg-white p-1.5 shadow-2xl ring-1 ring-stone-200">
              {SEARCH_EQUIPMENT_OPTIONS.map((option) => {
                const Icon = EQUIPMENT_ICONS[option.id];
                const active = option.id === selectedEquipment.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setEquipment(option.id);
                      setEquipmentOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition ${
                      active ? "bg-forest-50 text-forest-900" : "hover:bg-stone-50"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{option.label}</span>
                      <span className="block truncate text-xs text-stone-500">{option.description}</span>
                    </span>
                    {active && <Check size={15} className="text-forest-700" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label className="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-forest-600">
          <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            <Navigation size={12} /> Range
          </span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={MIN_SEARCH_RADIUS_KM}
              max={MAX_SEARCH_RADIUS_KM}
              step={10}
              aria-label="Search radius in kilometers"
              className="w-full min-w-0 bg-transparent text-sm font-semibold text-stone-950 outline-none"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              onBlur={(e) => setRadius(normalizeSearchRadiusKm(e.currentTarget.value))}
            />
            <span className="text-xs font-semibold text-stone-500">km</span>
          </span>
        </label>

        <button
          type="submit"
          className="inline-flex min-h-[3.45rem] items-center justify-center gap-2 rounded-md bg-forest-700 px-5 text-sm font-semibold text-white shadow-lg shadow-forest-950/20 transition hover:-translate-y-0.5 hover:bg-forest-800 disabled:translate-y-0 disabled:opacity-70"
          disabled={placeLoading && Boolean(locationQuery.trim())}
        >
          {placeLoading && locationQuery.trim() ? <Loader2 size={18} className="animate-spin" /> : <SearchIcon size={18} />}
          <span>Search</span>
        </button>
      </div>
    </form>
  );
}
