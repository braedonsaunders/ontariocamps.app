type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  REFRESH_API_KEY: string;
  SCHEDULED_OPERATOR_IDS?: string;
  SCHEDULED_MAX_SITES?: string;
  SCHEDULED_CONCURRENCY?: string;
  SCHEDULED_DELAY_MS?: string;
  SCHEDULED_DAYS?: string;
  SCHEDULED_MODE?: string;
  SCHEDULED_DISABLE_HOT_FALLBACK?: string;
};

type ScheduledEvent = { cron?: string; scheduledTime?: number };
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };
type CloudflareImageFit = "scale-down" | "contain" | "cover" | "crop" | "pad";
type CloudflareImageFormat = "avif" | "webp" | "jpeg";
type CloudflareImageOptions = {
  width?: number;
  height?: number;
  fit?: CloudflareImageFit;
  quality?: number;
  format?: CloudflareImageFormat;
  metadata?: "copyright";
  anim?: boolean;
};
type CloudflareFetchInit = RequestInit & {
  cf?: {
    image?: CloudflareImageOptions;
    cacheEverything?: boolean;
    cacheTtl?: number;
  };
};

type AvailabilityCode = "available" | "reserved" | "closed" | "unknown";
type Vendor = "camis5" | "goingtocamp" | "pcrs" | "campspot" | "letscamp";
type RefreshMode = "hot" | "near" | "planning" | "deep" | "ondemand";
type RefreshWindow = Exclude<RefreshMode, "ondemand">;

type FetchTarget = {
  site_id: string;
  vendor_site_id: string;
  park_id: string;
  park_slug: string;
  vendor_park_id: string;
  operator_id: string;
  operator_vendor: Vendor;
  operator_base_url: string;
  vendor_resource_location_id: number;
  vendor_resource_id: number;
  vendor_booking_category_id: number;
  equipment_category_id: number;
  sub_equipment_category_id: number;
  today_last_checked_at: string | null;
  hot_due_at: string | null;
  near_due_at: string | null;
  planning_due_at: string | null;
  deep_due_at: string | null;
};

type SiteNight = {
  site_id: string;
  night_date: string;
  status: AvailabilityCode;
  last_checked_at: string;
};

type CampspotAvailabilityRow = {
  id: number;
  availability?: string;
  failureReasons?: Array<{ errorType?: string; reason?: string }>;
};

type LetsCampCamp = {
  _id: string;
  siteSearchCriteria?: { allowedUnitTypes?: string[] };
  settings?: { minNights?: number; collectVehicleDataEnable?: boolean };
};

type LetsCampSearchResponse = {
  sites?: Array<{ _id: string }>;
  metaData?: {
    availabilityInfo?: {
      bookedSiteIds?: string[];
      lockedSiteIds?: string[];
    };
  };
};

type ProviderCaches = {
  campspotAvailability: Map<string, Promise<CampspotAvailabilityRow[]>>;
  letsCampCamp: Map<string, Promise<LetsCampCamp>>;
  letsCampAvailability: Map<string, Promise<LetsCampSearchResponse[]>>;
};

type RefreshOptions = {
  mode?: RefreshMode;
  window?: RefreshWindow;
  parkId?: string;
  parkSlug?: string;
  siteIds?: string[];
  operatorIds?: string[];
  startDate?: string;
  days?: number;
  staleMinutes?: number;
  staleHours?: number;
  maxSites?: number;
  concurrency?: number;
  delayMs?: number;
  skipRollups?: boolean;
};

type RefreshResult = {
  status: "success" | "partial" | "failed";
  mode: string;
  scope: string | null;
  startDate: string;
  endDate: string;
  sitesSeen: number;
  sitesUpdated: number;
  nightsUpdated: number;
  durationMs: number;
  errors: string[];
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";
const CAMPSPOT_REQUEST_DELAY_MS = 150;
const IMAGE_CACHE_SECONDS = 60 * 60 * 24 * 30;
const IMAGE_ALLOWED_HOSTS = new Set([
  "images.unsplash.com",
  "reservations.ontarioparks.ca",
  "reservations.parks.on.ca",
  "reservation.pc.gc.ca",
  "www.grcacamping.ca",
  "camping.trca.ca",
  "www.ontarioparks.ca",
  "parks.canada.ca",
  "www.grandriver.ca",
  "trca.ca",
  "npca.ca",
  "www.scrca.on.ca",
  "www.otonabeeconservation.com",
  "www.lprca.on.ca",
  "www.stlawrenceparks.com",
  "hcareservations.ca",
  "images.campspot.com",
  "res.cloudinary.com",
  "ontarioconservationareas.ca",
  "mvca.on.ca",
]);
const IMAGE_ALLOWED_SUFFIXES = [".goingtocamp.com"];
const IMAGE_PRESETS: Record<string, { width: number; height?: number; quality: number; fit: CloudflareImageFit }> = {
  card: { width: 520, height: 300, quality: 48, fit: "cover" },
  thumb: { width: 220, height: 160, quality: 46, fit: "cover" },
  strip: { width: 720, height: 96, quality: 42, fit: "cover" },
  hero: { width: 1280, quality: 60, fit: "scale-down" },
};
const WINDOW_CONFIG: Record<RefreshWindow, {
  startOffset: number;
  days: number;
  maxSites: number;
  concurrency: number;
  delayMs: number;
  dueField: keyof FetchTarget;
}> = {
  hot: {
    startOffset: 0,
    days: 2,
    maxSites: 180,
    concurrency: 3,
    delayMs: 450,
    dueField: "hot_due_at",
  },
  near: {
    startOffset: 3,
    days: 10,
    maxSites: 120,
    concurrency: 3,
    delayMs: 650,
    dueField: "near_due_at",
  },
  planning: {
    startOffset: 14,
    days: 75,
    maxSites: 60,
    concurrency: 2,
    delayMs: 900,
    dueField: "planning_due_at",
  },
  deep: {
    startOffset: 90,
    days: 89,
    maxSites: 30,
    concurrency: 2,
    delayMs: 1200,
    dueField: "deep_due_at",
  },
};

function isoDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * ONE_DAY_MS).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}

function envInt(value: string | undefined, min: number, max: number): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function envCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function envRefreshMode(value: string | undefined): RefreshMode | undefined {
  if (
    value === "hot"
    || value === "near"
    || value === "planning"
    || value === "deep"
    || value === "ondemand"
  ) {
    return value;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeAvailability(row: { availability: number; processedAvailability?: number }): AvailabilityCode {
  const code = row.processedAvailability ?? row.availability;
  if (code === 0) return "available";
  if (code === 2 || code === 3) return "closed";
  return "reserved";
}

function decodeCampspotAvailability(row?: CampspotAvailabilityRow): AvailabilityCode {
  if (!row) return "unknown";
  if (row.availability === "AVAILABLE") return "available";
  const reason = (row.failureReasons ?? []).map((r) => `${r.errorType ?? ""} ${r.reason ?? ""}`).join(" ").toLowerCase();
  if (reason.includes("closed") || reason.includes("outside") || reason.includes("not accepting")) return "closed";
  return "reserved";
}

function letsCampStatusForSite(siteId: string, responses: LetsCampSearchResponse[]): AvailabilityCode {
  const available = new Set<string>();
  const blocked = new Set<string>();
  for (const response of responses) {
    for (const site of response.sites ?? []) available.add(site._id);
    for (const id of response.metaData?.availabilityInfo?.bookedSiteIds ?? []) blocked.add(id);
    for (const id of response.metaData?.availabilityInfo?.lockedSiteIds ?? []) blocked.add(id);
  }
  if (available.has(siteId)) return "available";
  if (blocked.has(siteId)) return "reserved";
  return "reserved";
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

function imageError(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return IMAGE_ALLOWED_HOSTS.has(host) || IMAGE_ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function imageFormatFor(request: Request): CloudflareImageFormat {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("image/avif")) return "avif";
  if (accept.includes("image/webp")) return "webp";
  return "jpeg";
}

function imagePreset(url: URL): CloudflareImageOptions {
  const preset = IMAGE_PRESETS[url.searchParams.get("preset") ?? "card"] ?? IMAGE_PRESETS.card;
  const widthParam = url.searchParams.get("w");
  const width = clampInt(widthParam == null ? undefined : Number(widthParam), preset.width, 64, 1600);
  const heightParam = url.searchParams.get("h");
  const height = heightParam == null
    ? preset.height
    : clampInt(Number(heightParam), preset.height ?? Math.round(width * 0.62), 64, 1200);
  const qualityParam = url.searchParams.get("q");
  const quality = clampInt(qualityParam == null ? undefined : Number(qualityParam), preset.quality, 30, 82);

  return {
    width,
    height,
    quality,
    fit: preset.fit,
    metadata: "copyright",
    anim: false,
  };
}

async function handleImageRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return imageError("method not allowed", 405);
  }

  const url = new URL(request.url);
  const rawSrc = url.searchParams.get("src");
  if (!rawSrc) return imageError("missing image src");

  let src: URL;
  try {
    src = new URL(rawSrc);
  } catch {
    return imageError("invalid image src");
  }

  if (src.protocol !== "https:" || !isAllowedImageHost(src.hostname)) {
    return imageError("image host is not allowed");
  }
  if (src.hostname.endsWith(".workers.dev") || src.hostname === url.hostname) {
    return imageError("recursive image src is not allowed");
  }

  const options = imagePreset(url);
  const transformed = await fetch(src.toString(), {
    headers: {
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      "User-Agent": DEFAULT_USER_AGENT,
    },
    cf: {
      image: {
        ...options,
        format: imageFormatFor(request),
      },
      cacheEverything: true,
      cacheTtl: IMAGE_CACHE_SECONDS,
    },
  } as CloudflareFetchInit);

  if (!transformed.ok) {
    return new Response(transformed.body, {
      status: transformed.status,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Image-Proxy": "transform-error",
      },
    });
  }

  const headers = new Headers(transformed.headers);
  headers.set("Cache-Control", `public, max-age=${IMAGE_CACHE_SECONDS}, immutable`);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Timing-Allow-Origin", "*");
  headers.set("Vary", "Accept");
  headers.set("X-Image-Proxy", "cloudflare-resized");
  headers.delete("Set-Cookie");

  return new Response(request.method === "HEAD" ? null : transformed.body, {
    status: transformed.status,
    headers,
  });
}

function restHeaders(env: Env, extra?: HeadersInit): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };
}

async function rest<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: restHeaders(env, init.headers),
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase REST ${response.status} ${path}: ${text.slice(0, 260)}`);
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function scopeFor(opts: Required<Pick<RefreshOptions, "mode">> & RefreshOptions): string | null {
  if (opts.siteIds?.length) return `sites:${opts.siteIds.length}`;
  if (opts.parkId) return `park:${opts.parkId}`;
  if (opts.parkSlug) return `park:${opts.parkSlug}`;
  if (opts.operatorIds?.length) return opts.operatorIds.join(",");
  return opts.mode;
}

function windowFor(opts: Required<Pick<RefreshOptions, "mode">> & RefreshOptions): RefreshWindow | null {
  if (opts.window) return opts.window;
  return opts.mode === "ondemand" ? null : opts.mode;
}

async function startLog(env: Env, scope: string | null): Promise<number> {
  const rows = await rest<Array<{ id: number }>>(env, "refresh_log?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      refresh_type: "availability",
      scope,
      started_at: new Date().toISOString(),
      status: "running",
    }),
  });
  return Number(rows[0].id);
}

async function finishLog(env: Env, args: {
  id: number;
  status: "success" | "partial" | "failed";
  sitesSeen: number;
  sitesUpdated: number;
  nightsUpdated: number;
  durationMs: number;
  errors: string[];
}): Promise<void> {
  await rest(env, `refresh_log?id=eq.${args.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      finished_at: new Date().toISOString(),
      status: args.status,
      sites_seen: args.sitesSeen,
      sites_updated: args.sitesUpdated,
      nights_updated: args.nightsUpdated,
      duration_ms: args.durationMs,
      errors: args.errors,
    }),
  });
  if (args.status === "success") {
    await rest(env, "refresh_meta?on_conflict=refresh_type", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ refresh_type: "availability", last_success_at: new Date().toISOString() }),
    });
  }
}

function buildTargetPath(opts: RefreshOptions & { maxSites: number }): string {
  const window = windowFor({ ...opts, mode: opts.mode ?? "hot" });
  const dueField = window ? WINDOW_CONFIG[window].dueField : "today_last_checked_at";
  const parts = [
    "availability_fetch_targets?select=*",
    `order=${String(dueField)}.asc.nullsfirst,site_id.asc`,
  ];
  if (!opts.parkId && !opts.parkSlug && !opts.siteIds?.length) {
    // Scheduled refreshes are ordered by the relevant due timestamp so the
    // oldest/most important work is handled first.
  } else {
    parts[1] = "order=today_last_checked_at.asc.nullsfirst,site_id.asc";
  }
  if (opts.parkId) parts.push(`park_id=eq.${encodeURIComponent(opts.parkId)}`);
  if (opts.parkSlug) parts.push(`park_slug=eq.${encodeURIComponent(opts.parkSlug)}`);
  if (opts.operatorIds?.length) parts.push(`operator_id=in.(${opts.operatorIds.map(encodeURIComponent).join(",")})`);
  if (opts.siteIds?.length && opts.siteIds.length <= 80) parts.push(`site_id=in.(${opts.siteIds.map(encodeURIComponent).join(",")})`);

  const staleMinutes = opts.staleMinutes ?? (opts.staleHours == null ? null : opts.staleHours * 60);
  if (!opts.parkId && !opts.parkSlug && !opts.siteIds?.length && staleMinutes != null) {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
    parts.push(`or=(${String(dueField)}.is.null,${String(dueField)}.lte.${encodeURIComponent(cutoff)})`);
  } else if (!opts.parkId && !opts.parkSlug && !opts.siteIds?.length && window) {
    const now = new Date().toISOString();
    parts.push(`or=(${String(dueField)}.is.null,${String(dueField)}.lte.${encodeURIComponent(now)})`);
  }

  if (!opts.siteIds?.length || opts.siteIds.length <= 80) parts.push(`limit=${opts.maxSites}`);
  return parts.join("&");
}

async function loadTargets(env: Env, opts: RefreshOptions & { maxSites: number; startDate: string }): Promise<FetchTarget[]> {
  const window = windowFor({ ...opts, mode: opts.mode ?? "hot" });
  if (window && !opts.parkId && !opts.parkSlug && !opts.siteIds?.length && !opts.operatorIds?.length) {
    return rest<FetchTarget[]>(env, "rpc/claim_availability_refresh_targets", {
      method: "POST",
      body: JSON.stringify({ p_window: window, p_limit: opts.maxSites }),
    });
  }

  let targets = await rest<FetchTarget[]>(env, buildTargetPath(opts));

  if (opts.siteIds?.length && opts.siteIds.length > 80) {
    const wanted = new Set(opts.siteIds);
    targets = targets.filter((t) => wanted.has(t.site_id));
  }

  if (opts.parkId || opts.parkSlug || opts.siteIds?.length) {
    const staleMinutes = opts.staleMinutes ?? (opts.staleHours == null ? 2 : opts.staleHours * 60);
    const cutoff = Date.now() - staleMinutes * 60 * 1000;
    const ids = targets.map((t) => t.site_id);
    const fresh = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80);
      const rows = await rest<Array<{ site_id: string; last_checked_at: string }>>(
        env,
        `site_availability?select=site_id,last_checked_at&night_date=eq.${opts.startDate}&site_id=in.(${chunk.map(encodeURIComponent).join(",")})`,
      );
      for (const row of rows) fresh.set(row.site_id, Date.parse(row.last_checked_at));
    }
    targets = targets.filter((target) => (fresh.get(target.site_id) ?? 0) <= cutoff);
  }

  return targets.slice(0, opts.maxSites);
}

async function upsertAvailability(env: Env, rows: SiteNight[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await rest(env, "site_availability?on_conflict=site_id,night_date", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(chunk),
    });
  }
}

function dueAt(window: RefreshWindow, checkedAt: string, rows: SiteNight[]): string {
  const available = rows.filter((row) => row.status === "available").length;
  const reserved = rows.filter((row) => row.status === "reserved").length;
  const base = new Date(checkedAt).getTime();
  const hours =
    window === "hot"
      ? available > 0 ? 4 : reserved > 0 ? 18 : 72
      : window === "near"
        ? available > 0 ? 18 : reserved > 0 ? 48 : 10 * 24
        : window === "planning"
          ? available > 0 ? 72 : reserved > 0 ? 7 * 24 : 30 * 24
          : available > 0 ? 7 * 24 : reserved > 0 ? 21 * 24 : 45 * 24;
  return new Date(base + hours * 60 * 60 * 1000).toISOString();
}

async function updateRefreshState(env: Env, siteId: string, window: RefreshWindow, rows: SiteNight[]): Promise<void> {
  if (rows.length === 0) return;
  const checkedAt = rows[0].last_checked_at;
  const patch: Record<string, unknown> = {
    site_id: siteId,
    [`${window}_last_checked_at`]: checkedAt,
    [`${window}_due_at`]: dueAt(window, checkedAt, rows),
    [`${window}_sampled_nights`]: rows.length,
    [`${window}_available_nights`]: rows.filter((row) => row.status === "available").length,
    [`${window}_reserved_nights`]: rows.filter((row) => row.status === "reserved").length,
    updated_at: new Date().toISOString(),
  };
  await rest(env, "availability_refresh_state?on_conflict=site_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(patch),
  });
}

function campspotHeaders(baseUrl: string, slug: string): HeadersInit {
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-CA,en;q=0.9",
    Referer: `${baseUrl.replace(/\/+$/, "")}/book/${slug}`,
    "User-Agent": DEFAULT_USER_AGENT,
    "x-cognito-userpool-clientid": "60jmeb5kmfgfkeljne4car54vo",
    "x-client-type": "CONSUMER",
  };
}

async function fetchCampspotRows(target: FetchTarget, night: string, caches: ProviderCaches): Promise<CampspotAvailabilityRow[]> {
  const cacheKey = `${target.operator_id}:${target.vendor_park_id}:${night}`;
  let promise = caches.campspotAvailability.get(cacheKey);
  if (!promise) {
    const baseUrl = target.operator_base_url.replace(/\/+$/, "");
    const url = new URL(`${baseUrl}/api/gator-core/v2/availability/parks/${target.vendor_park_id}`);
    url.searchParams.set("checkin", night);
    url.searchParams.set("checkout", addDays(night, 1));
    url.searchParams.set("guests", "guests0,2,0");
    url.searchParams.set("useCustomParkData", "true");
    url.searchParams.set("includeUnavailable", "true");
    promise = (async () => {
      await sleep(CAMPSPOT_REQUEST_DELAY_MS + Math.floor(Math.random() * 100));
      const response = await fetch(url, {
        headers: campspotHeaders(baseUrl, target.park_slug),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Campspot HTTP ${response.status} at ${url.hostname}${url.pathname}`);
      return await response.json() as CampspotAvailabilityRow[];
    })();
    caches.campspotAvailability.set(cacheKey, promise);
  }
  return promise;
}

function letsCampHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-tenant-type": "camp",
  };
}

async function fetchLetsCampCamp(target: FetchTarget, caches: ProviderCaches): Promise<LetsCampCamp> {
  let promise = caches.letsCampCamp.get(target.vendor_park_id);
  if (!promise) {
    const baseUrl = target.operator_base_url.replace(/\/+$/, "");
    promise = fetch(`${baseUrl}/api/camps/${encodeURIComponent(target.vendor_park_id)}`, {
      headers: letsCampHeaders(),
      signal: AbortSignal.timeout(20_000),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Let's Camp camp HTTP ${response.status}`);
      const data = await response.json() as { camp?: LetsCampCamp | null };
      if (!data.camp) throw new Error("Let's Camp camp not found");
      return data.camp;
    });
    caches.letsCampCamp.set(target.vendor_park_id, promise);
  }
  return promise;
}

function letsCampUnitSearches(camp: LetsCampCamp) {
  const allowed = camp.siteSearchCriteria?.allowedUnitTypes?.length ? camp.siteSearchCriteria.allowedUnitTypes : ["tent"];
  return allowed.map((unitType, i) => unitType === "rv"
    ? [{ uid: `unitTypeSiteSearch_${i}`, unitType, length: 20, measurementUnit: "ft" }]
    : [{ uid: `unitTypeSiteSearch_${i}`, unitType }]);
}

async function fetchLetsCampResponses(target: FetchTarget, camp: LetsCampCamp, night: string, caches: ProviderCaches): Promise<LetsCampSearchResponse[]> {
  const cacheKey = `${target.operator_id}:${target.vendor_park_id}:${night}`;
  let promise = caches.letsCampAvailability.get(cacheKey);
  if (!promise) {
    const baseUrl = target.operator_base_url.replace(/\/+$/, "");
    const minNights = Math.max(1, Math.floor(camp.settings?.minNights ?? 1));
    const endDate = addDays(night, minNights);
    promise = Promise.all(letsCampUnitSearches(camp).map(async (unitTypes) => {
      const body = {
        startDate: night,
        endDate,
        guestCount: { infant: 0, youth: 0, adult: 2, senior: 0 },
        numPets: 0,
        unitTypes,
        electrical: [],
        water: false,
        sewer: false,
        pullThrough: false,
        accessible: false,
        allowPastDates: false,
        numVehicles: camp.settings?.collectVehicleDataEnable ? 1 : undefined,
      };
      const response = await fetch(`${baseUrl}/api/camps/${encodeURIComponent(camp._id)}/sites/available/search`, {
        method: "POST",
        headers: letsCampHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Let's Camp availability HTTP ${response.status}`);
      return await response.json() as LetsCampSearchResponse;
    }));
    caches.letsCampAvailability.set(cacheKey, promise);
  }
  return promise;
}

async function fetchVendorAvailability(target: FetchTarget, startDate: string, endDate: string, caches: ProviderCaches): Promise<SiteNight[]> {
  const nowIso = new Date().toISOString();
  if (target.operator_vendor === "campspot") {
    const out: SiteNight[] = [];
    for (let night = startDate; night < endDate; night = addDays(night, 1)) {
      const rows = await fetchCampspotRows(target, night, caches);
      const row = rows.find((r) => String(r.id) === target.vendor_site_id);
      out.push({ site_id: target.site_id, night_date: night, status: decodeCampspotAvailability(row), last_checked_at: nowIso });
    }
    return out;
  }

  if (target.operator_vendor === "letscamp") {
    const camp = await fetchLetsCampCamp(target, caches);
    const out: SiteNight[] = [];
    for (let night = startDate; night < endDate; night = addDays(night, 1)) {
      const responses = await fetchLetsCampResponses(target, camp, night, caches);
      out.push({ site_id: target.site_id, night_date: night, status: letsCampStatusForSite(target.vendor_site_id, responses), last_checked_at: nowIso });
    }
    return out;
  }

  const baseUrl = target.operator_base_url.replace(/\/+$/, "");
  const url = new URL(baseUrl + "/api/availability/resourceDailyAvailability");
  url.searchParams.set("resourceLocationId", String(target.vendor_resource_location_id));
  url.searchParams.set("resourceId", String(target.vendor_resource_id));
  url.searchParams.set("bookingCategoryId", String(target.vendor_booking_category_id));
  url.searchParams.set("equipmentCategoryId", String(target.equipment_category_id));
  url.searchParams.set("subEquipmentCategoryId", String(target.sub_equipment_category_id));
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("partySize", "2");
  url.searchParams.set("numAdults", "2");
  url.searchParams.set("numChildren", "0");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-CA,en;q=0.9",
      Referer: baseUrl + "/create-booking/",
      "User-Agent": DEFAULT_USER_AGENT,
      "X-Contact": "ontariocamps.app - lightweight availability refresh",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${url.hostname}${url.pathname}`);

  const rows = await response.json() as Array<{ availability: number; processedAvailability?: number }>;
  let night = startDate;
  return rows.map((row) => {
    const out = {
      site_id: target.site_id,
      night_date: night,
      status: decodeAvailability(row),
      last_checked_at: nowIso,
    };
    night = addDays(night, 1);
    return out;
  });
}

async function refreshAvailability(env: Env, input: RefreshOptions): Promise<RefreshResult> {
  const started = Date.now();
  const mode = input.mode ?? (input.parkId || input.parkSlug || input.siteIds?.length ? "ondemand" : "hot");
  const window = windowFor({ ...input, mode });
  const config = window ? WINDOW_CONFIG[window] : null;
  const startDate = input.startDate ?? isoDate(config?.startOffset ?? 0);
  const days = clampInt(input.days, config?.days ?? (mode === "ondemand" ? 14 : 30), 1, 180);
  const endDate = addDays(startDate, days);
  const maxSites = clampInt(input.maxSites, config?.maxSites ?? (mode === "ondemand" ? 500 : 90), 0, 1000);
  const concurrency = clampInt(input.concurrency, config?.concurrency ?? (mode === "ondemand" ? 4 : 2), 1, 8);
  const delayMs = clampInt(input.delayMs, config?.delayMs ?? (mode === "ondemand" ? 250 : 900), 0, 5000);
  const opts = { ...input, mode, window: window ?? undefined, startDate, days, maxSites, concurrency, delayMs };
  const scope = scopeFor(opts);
  const logId = await startLog(env, scope);
  try {
    const targets = await loadTargets(env, opts);
    const errors: string[] = [];
    const caches: ProviderCaches = {
      campspotAvailability: new Map(),
      letsCampCamp: new Map(),
      letsCampAvailability: new Map(),
    };
    let cursor = 0;
    let sitesUpdated = 0;
    let nightsUpdated = 0;

    async function worker() {
      while (true) {
        const i = cursor++;
        if (i >= targets.length) return;
        const target = targets[i];
        try {
          if (delayMs > 0) await sleep(delayMs + Math.floor(Math.random() * 200));
          const rows = await fetchVendorAvailability(target, startDate, endDate, caches);
          await upsertAvailability(env, rows);
          if (opts.window) await updateRefreshState(env, target.site_id, opts.window, rows);
          sitesUpdated += 1;
          nightsUpdated += rows.length;
        } catch (err) {
          if (errors.length < 50) errors.push(`site ${target.site_id}: ${(err as Error).message}`);
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    const status = errors.length ? "partial" : "success";
    const result: RefreshResult = {
      status,
      mode,
      scope,
      startDate,
      endDate,
      sitesSeen: targets.length,
      sitesUpdated,
      nightsUpdated,
      durationMs: Date.now() - started,
      errors,
    };
    await finishLog(env, {
      id: logId,
      status,
      sitesSeen: result.sitesSeen,
      sitesUpdated,
      nightsUpdated,
      durationMs: result.durationMs,
      errors,
    });
    return result;
  } catch (err) {
    const result: RefreshResult = {
      status: "failed",
      mode,
      scope,
      startDate,
      endDate,
      sitesSeen: 0,
      sitesUpdated: 0,
      nightsUpdated: 0,
      durationMs: Date.now() - started,
      errors: [(err as Error).message],
    };
    await finishLog(env, {
      id: logId,
      status: "failed",
      sitesSeen: 0,
      sitesUpdated: 0,
      nightsUpdated: 0,
      durationMs: result.durationMs,
      errors: result.errors,
    });
    return result;
  }
}

function requireAuth(request: Request, env: Env): Response | null {
  const supplied = request.headers.get("x-refresh-key") ?? "";
  if (constantTimeEqual(supplied, env.REFRESH_API_KEY)) return null;
  return json({ error: "unauthorized" }, { status: 401 });
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
    return json({ ok: true, colo: cf.colo, country: cf.country, region: cf.region, city: cf.city });
  }

  if (url.pathname === "/image") return handleImageRequest(request);

  const auth = requireAuth(request, env);
  if (auth) return auth;

  if (request.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 8_000) return json({ error: "request body too large" }, { status: 413 });
  const body = await request.json().catch(() => ({})) as RefreshOptions;
  if (url.pathname === "/refresh" || url.pathname === "/") return json(await refreshAvailability(env, body));
  return json({ error: "not found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleFetch(request, env);
    } catch (err) {
      return json({ error: (err as Error).message }, { status: 500 });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const minute = new Date().getUTCMinutes();
    const hour = new Date().getUTCHours();
    const mode: RefreshMode = envRefreshMode(env.SCHEDULED_MODE) ?? (minute === 0
      ? (hour % 2 === 0 ? "planning" : "deep")
      : (minute === 15 || minute === 45 ? "near" : "hot"));
    const operatorIds = envCsv(env.SCHEDULED_OPERATOR_IDS);
    const scheduledOptions: RefreshOptions = {
      mode,
      skipRollups: true,
      operatorIds: operatorIds.length ? operatorIds : undefined,
      maxSites: envInt(env.SCHEDULED_MAX_SITES, 0, 1000),
      concurrency: envInt(env.SCHEDULED_CONCURRENCY, 1, 8),
      delayMs: envInt(env.SCHEDULED_DELAY_MS, 0, 5000),
      days: envInt(env.SCHEDULED_DAYS, 1, 180),
    };
    const run = (async () => {
      const primary = await refreshAvailability(env, scheduledOptions);
      const hotFallbackDisabled = env.SCHEDULED_DISABLE_HOT_FALLBACK === "true";
      if (mode !== "hot" && primary.sitesSeen === 0 && !hotFallbackDisabled) {
        const fallback = await refreshAvailability(env, { ...scheduledOptions, mode: "hot" });
        return { primary, fallback };
      }
      return { primary };
    })();
    ctx.waitUntil(run.then((result) => console.log(JSON.stringify(result))).catch((err) => console.error(err)));
  },
};
