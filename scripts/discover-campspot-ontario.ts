import { writeFile } from "node:fs/promises";

type CampspotDiscoveryArgs = {
  concurrency: number;
  out: string;
};

type CampspotParkPayload = {
  id?: number;
  slug?: string;
  name?: string;
  displayName?: string;
  city?: string;
  state?: string;
  address?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  aggregatorSlug?: string;
  mapUrl?: string;
  marketingSite?: string;
  email?: string;
  phoneNumber?: string;
  logo?: unknown;
  media?: { mainImage?: unknown };
  backgroundImage?: unknown;
};

const PARK_SITEMAP = "https://www.campspot.com/c/sitemap/park/sitemap.xml";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Accept-Language": "en-CA,en;q=0.9",
};

function parseArgs(argv: string[]): CampspotDiscoveryArgs {
  const args: CampspotDiscoveryArgs = {
    concurrency: 10,
    out: "data/campspot-ontario-discovery.json",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--concurrency") args.concurrency = Math.max(1, Number(argv[++i] ?? "10"));
    else if (arg === "--out") args.out = argv[++i] ?? args.out;
  }
  return args;
}

function regionFor(park: CampspotParkPayload): string {
  const lat = Number(park.latitude);
  const lng = Number(park.longitude);
  if (Number.isFinite(lat) && lat >= 46.2) return "Northeastern";
  if (Number.isFinite(lng) && lng > -77.9) return "Eastern Ontario";
  if (Number.isFinite(lng) && lng <= -81.4) return "Southwestern Ontario";
  if (Number.isFinite(lat) && lat >= 44.3) return "Central Ontario";
  return "Southwestern Ontario";
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return await response.text();
}

async function fetchPark(url: string, attempt = 1): Promise<Record<string, unknown>> {
  try {
    const html = await fetchText(url);
    const script = html.match(/<script[^>]+id="campspot-aggregator-state"[^>]*>([\s\S]*?)<\/script>/);
    if (!script) return { url, skipped: "missing state script" };
    const state = JSON.parse(script[1]) as Record<string, unknown>;
    const hit = Object.entries(state).find(([key, value]) => {
      try {
        return decodeURIComponent(key).includes("/v2/parks/slug/")
          && value != null
          && typeof value === "object"
          && "park" in value;
      } catch {
        return false;
      }
    });
    if (!hit) return { url, skipped: "missing park payload" };
    const park = (hit[1] as { park: CampspotParkPayload }).park;
    if (park.state !== "ON") return { url, skipped: park.state ?? "non-ON" };
    return {
      url,
      aggregatorSlug: park.aggregatorSlug ?? url.split("/").pop(),
      id: park.id,
      slug: park.slug,
      name: park.name,
      displayName: park.displayName ?? park.name,
      city: park.city ?? null,
      state: park.state ?? null,
      address: park.address ?? null,
      postalCode: park.postalCode ?? null,
      latitude: park.latitude ?? null,
      longitude: park.longitude ?? null,
      region: regionFor(park),
      mapUrl: park.mapUrl ?? null,
      marketingSite: park.marketingSite ?? null,
      email: park.email ?? null,
      phoneNumber: park.phoneNumber ?? null,
      hasLogo: park.logo != null,
      hasMedia: park.media?.mainImage != null || park.backgroundImage != null,
    };
  } catch (err) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      return fetchPark(url, attempt + 1);
    }
    return { url, error: (err as Error).message };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sitemapText = await fetchText(PARK_SITEMAP);
  const urls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  console.error(`[discover:campspot] sitemap parks=${urls.length}`);

  const results: Record<string, unknown>[] = [];
  let cursor = 0;
  let done = 0;
  let ontarioCount = 0;
  const started = Date.now();

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= urls.length) return;
      const result = await fetchPark(urls[index]);
      results[index] = result;
      done += 1;
      if (!result.skipped && !result.error) ontarioCount += 1;
      if (done % 100 === 0 || done === urls.length) {
        console.error(`[discover:campspot] ${done}/${urls.length} done, ON=${ontarioCount}, ${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
    }
  }

  await Promise.all(Array.from({ length: args.concurrency }, worker));

  const parks = results
    .filter((result) => !result.skipped && !result.error)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const errors = results.filter((result) => result.error);
  const skipped = results.filter((result) => result.skipped).reduce<Record<string, number>>((acc, result) => {
    const key = String(result.skipped);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  await writeFile(args.out, JSON.stringify({
    source: PARK_SITEMAP,
    discoveredAt: new Date().toISOString(),
    totalUrls: urls.length,
    parks,
    errors,
    skipped,
  }, null, 2));
  console.error(`[discover:campspot] wrote ${args.out}; parks=${parks.length}, errors=${errors.length}`);
}

main().catch((err) => {
  console.error("[discover:campspot] fatal:", err);
  process.exit(1);
});
