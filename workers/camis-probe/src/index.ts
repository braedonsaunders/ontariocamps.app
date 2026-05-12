type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  REFRESH_API_KEY: string;
};

type ScheduledEvent = { cron?: string; scheduledTime?: number };
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

type AvailabilityCode = "available" | "reserved" | "closed" | "unknown";

type FetchTarget = {
  site_id: string;
  park_id: string;
  park_slug: string;
  operator_id: string;
  operator_base_url: string;
  vendor_resource_location_id: number;
  vendor_resource_id: number;
  vendor_booking_category_id: number;
  equipment_category_id: number;
  sub_equipment_category_id: number;
  today_last_checked_at: string | null;
};

type SiteNight = {
  site_id: string;
  night_date: string;
  status: AvailabilityCode;
  last_checked_at: string;
};

type RefreshOptions = {
  mode?: "hot" | "deep" | "ondemand";
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
  status: "success" | "partial";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeAvailability(row: { availability: number; processedAvailability?: number }): AvailabilityCode {
  const code = row.processedAvailability ?? row.availability;
  if (code === 0) return "available";
  if (code === 2 || code === 3) return "closed";
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
  status: "success" | "partial";
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
  const parts = [
    "availability_fetch_targets?select=*",
    "order=today_last_checked_at.asc.nullsfirst",
    "order=site_id.asc",
  ];
  if (opts.parkId) parts.push(`park_id=eq.${encodeURIComponent(opts.parkId)}`);
  if (opts.parkSlug) parts.push(`park_slug=eq.${encodeURIComponent(opts.parkSlug)}`);
  if (opts.operatorIds?.length) parts.push(`operator_id=in.(${opts.operatorIds.map(encodeURIComponent).join(",")})`);
  if (opts.siteIds?.length && opts.siteIds.length <= 80) parts.push(`site_id=in.(${opts.siteIds.map(encodeURIComponent).join(",")})`);

  const staleMinutes = opts.staleMinutes ?? (opts.staleHours == null ? null : opts.staleHours * 60);
  if (!opts.parkId && !opts.parkSlug && !opts.siteIds?.length && staleMinutes != null) {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
    parts.push(`or=(today_last_checked_at.is.null,today_last_checked_at.lte.${encodeURIComponent(cutoff)})`);
  }

  if (!opts.siteIds?.length || opts.siteIds.length <= 80) parts.push(`limit=${opts.maxSites}`);
  return parts.join("&");
}

async function loadTargets(env: Env, opts: RefreshOptions & { maxSites: number; startDate: string }): Promise<FetchTarget[]> {
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

async function fetchVendorAvailability(target: FetchTarget, startDate: string, endDate: string): Promise<SiteNight[]> {
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
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${url.hostname}${url.pathname}`);

  const rows = await response.json() as Array<{ availability: number; processedAvailability?: number }>;
  const nowIso = new Date().toISOString();
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
  const startDate = input.startDate ?? isoDate();
  const days = clampInt(input.days, mode === "deep" ? 180 : mode === "ondemand" ? 14 : 30, 1, 180);
  const endDate = addDays(startDate, days);
  const maxSites = clampInt(input.maxSites, mode === "ondemand" ? 500 : mode === "deep" ? 60 : 90, 0, 1000);
  const concurrency = clampInt(input.concurrency, mode === "ondemand" ? 4 : 2, 1, 8);
  const delayMs = clampInt(input.delayMs, mode === "ondemand" ? 250 : 900, 0, 5000);
  const opts = { ...input, mode, startDate, days, maxSites, concurrency, delayMs };
  const scope = scopeFor(opts);
  const logId = await startLog(env, scope);
  const targets = await loadTargets(env, opts);
  const errors: string[] = [];
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
        const rows = await fetchVendorAvailability(target, startDate, endDate);
        await upsertAvailability(env, rows);
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
    const mode: "hot" | "deep" = minute === 0 ? "deep" : "hot";
    const run = refreshAvailability(env, mode === "deep"
      ? { mode, days: 180, staleHours: 72, maxSites: 20, concurrency: 2, delayMs: 1000, skipRollups: true }
      : { mode, days: 14, staleHours: 12, maxSites: 30, concurrency: 2, delayMs: 900, skipRollups: true });
    ctx.waitUntil(run.then((result) => console.log(JSON.stringify(result))).catch((err) => console.error(err)));
  },
};
