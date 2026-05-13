import { displayOperatorName } from "@/lib/display";
import { PRESET_LOCATIONS } from "@/lib/locations";

export type ParkSuggestionSource = {
  slug: string;
  name: string;
  operator: string;
  region: string;
  lat: number;
  lng: number;
  available_sites: number;
};

export type LocationSuggestion = {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
  type: string;
  source: "park" | "preset" | "place" | "device";
  slug?: string;
};

type GeocodeResponse = {
  suggestions?: Array<{
    id: string;
    label: string;
    detail: string;
    lat: number;
    lng: number;
    type: string;
  }>;
};

export function normalizeLookupTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:ontario|canada|provincial|park|campground|conservation|area)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolvePresetLocation(input: string): { lat: number; lng: number; label: string } | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  const normalizedQ = normalizeLookupTerm(input);

  if (PRESET_LOCATIONS[q]) return PRESET_LOCATIONS[q];
  if (normalizedQ && PRESET_LOCATIONS[normalizedQ]) return PRESET_LOCATIONS[normalizedQ];

  for (const preset of Object.values(PRESET_LOCATIONS)) {
    if (
      preset.label.toLowerCase() === q ||
      (normalizedQ && normalizeLookupTerm(preset.label) === normalizedQ)
    ) {
      return preset;
    }
  }

  for (const preset of Object.values(PRESET_LOCATIONS)) {
    const normalizedLabel = normalizeLookupTerm(preset.label);
    if (preset.label.toLowerCase().startsWith(q) || (normalizedQ && normalizedLabel.startsWith(normalizedQ))) {
      return preset;
    }
  }

  return null;
}

export function scoreParkLookup(query: string, park: ParkSuggestionSource): number {
  const q = normalizeLookupTerm(query);
  if (!q) return 0;
  const name = normalizeLookupTerm(park.name);
  const haystack = normalizeLookupTerm(`${park.name} ${park.operator} ${park.region}`);
  const tokens = q.split(" ").filter(Boolean);

  if (!tokens.every((token) => haystack.includes(token))) return 0;
  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (name.includes(q)) return 80;
  return 60 + Math.min(tokens.length, 5);
}

export function parkLocationSuggestions(
  query: string,
  parks: ParkSuggestionSource[],
  limit = 5,
): LocationSuggestion[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return parks
    .map((park) => ({ park, score: scoreParkLookup(trimmed, park) }))
    .filter((match) => match.score >= 80)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.park.available_sites - a.park.available_sites ||
        a.park.name.localeCompare(b.park.name),
    )
    .slice(0, limit)
    .map(({ park }) => ({
      id: `park:${park.slug}`,
      label: park.name,
      detail: `Park · ${displayOperatorName(park.operator)}${park.region ? ` · ${park.region}` : ""}`,
      lat: park.lat,
      lng: park.lng,
      type: "park",
      source: "park",
      slug: park.slug,
    }));
}

export function presetLocationSuggestions(query: string, limit = 3): LocationSuggestion[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const q = trimmed.toLowerCase();
  const normalizedQ = normalizeLookupTerm(trimmed);

  return Object.entries(PRESET_LOCATIONS)
    .map(([key, preset]) => {
      const label = preset.label.toLowerCase();
      const normalizedLabel = normalizeLookupTerm(preset.label);
      let score = 0;
      if (key === q || label === q || normalizedLabel === normalizedQ) score = 100;
      else if (key.startsWith(q) || label.startsWith(q) || normalizedLabel.startsWith(normalizedQ)) score = 90;
      else if (label.includes(q) || normalizedLabel.includes(normalizedQ)) score = 70;
      return { key, preset, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.preset.label.localeCompare(b.preset.label))
    .slice(0, limit)
    .map(({ key, preset }) => ({
      id: `preset:${key}`,
      label: preset.label,
      detail: "Town or city · Ontario",
      lat: preset.lat,
      lng: preset.lng,
      type: "preset",
      source: "preset",
    }));
}

export function localLocationSuggestions(
  query: string,
  parks: ParkSuggestionSource[],
  limit = 8,
): LocationSuggestion[] {
  return mergeLocationSuggestions([
    ...parkLocationSuggestions(query, parks, 5),
    ...presetLocationSuggestions(query, 4),
  ]).slice(0, limit);
}

export async function fetchPlaceSuggestions(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, { signal });
  if (!response.ok) return [];

  const data = (await response.json()) as GeocodeResponse;
  return (data.suggestions ?? []).map((suggestion) => ({
    ...suggestion,
    source: "place" as const,
  }));
}

export function mergeLocationSuggestions(suggestions: LocationSuggestion[]): LocationSuggestion[] {
  const seen = new Set<string>();
  const merged: LocationSuggestion[] = [];

  for (const suggestion of suggestions) {
    const key = `${normalizeLookupTerm(suggestion.label)}|${suggestion.lat.toFixed(3)}|${suggestion.lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(suggestion);
  }

  return merged;
}
