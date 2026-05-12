import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type NominatimResult = {
  place_id?: number;
  osm_id?: number;
  lat: string;
  lon: string;
  display_name?: string;
  type?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

type PlaceSuggestion = {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
  type: string;
};

const ONTARIO_VIEWBOX = "-95.2,56.9,-74.3,41.6";

function compact(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ");
}

function placeLabel(result: NominatimResult) {
  const address = result.address ?? {};
  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    address.postcode ??
    result.display_name?.split(",")[0]?.trim() ??
    "Ontario"
  );
}

function isOntario(result: NominatimResult) {
  const state = result.address?.state?.toLowerCase();
  return state === "ontario" || result.display_name?.toLowerCase().includes("ontario");
}

function toSuggestion(result: NominatimResult): PlaceSuggestion | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = result.address ?? {};
  const label = placeLabel(result);
  const detail = compact([
    address.municipality && address.municipality !== label ? address.municipality : null,
    address.county && address.county !== label ? address.county : null,
    address.state ?? "Ontario",
    address.country ?? "Canada",
  ]);

  return {
    id: String(result.place_id ?? result.osm_id ?? `${lat},${lng}`),
    label,
    detail,
    lat,
    lng,
    type: result.type ?? "place",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const upstream = new URL("https://nominatim.openstreetmap.org/search");
  upstream.searchParams.set("format", "jsonv2");
  upstream.searchParams.set("addressdetails", "1");
  upstream.searchParams.set("countrycodes", "ca");
  upstream.searchParams.set("viewbox", ONTARIO_VIEWBOX);
  upstream.searchParams.set("bounded", "1");
  upstream.searchParams.set("limit", "6");
  upstream.searchParams.set("q", q);

  let response: Response;
  try {
    response = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-CA,en;q=0.9",
        "User-Agent": "ontariocamps.app/1.0 (https://ontariocamps.app)",
      },
      next: { revalidate: 60 * 60 * 24 * 14 },
    });
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ suggestions: [] }, { status: 502 });
  }

  const raw = (await response.json()) as NominatimResult[];
  const seen = new Set<string>();
  const suggestions = raw
    .filter(isOntario)
    .map(toSuggestion)
    .filter((item): item is PlaceSuggestion => Boolean(item))
    .filter((item) => {
      const key = `${item.label.toLowerCase()}|${item.lat.toFixed(3)}|${item.lng.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=1209600, stale-while-revalidate=86400" } },
  );
}
