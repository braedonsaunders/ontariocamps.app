type AvailabilityCode = "available" | "reserved" | "closed" | "unknown";

type Target = {
  site_id: string;
  vendor_resource_location_id: number;
  vendor_resource_id: number;
  vendor_booking_category_id: number;
  operator_id: string;
  operator_base_url: string;
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

type RefreshRequest = {
  days?: number;
  staleHours?: number;
  missingOnly?: boolean;
  shardCount?: number;
  shardIndex?: number;
  operatorIds?: string[];
  concurrency?: number;
  delayMs?: number;
  maxSites?: number;
};

const SUPABASE_URL = Deno.env.get("PROJECT_URL") ?? Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function decodeAvailability(row: { availability: number; processedAvailability?: number }): AvailabilityCode {
  const code = row.processedAvailability ?? row.availability;
  if (code === 0) return "available";
  if (code === 2 || code === 3) return "closed";
  return "reserved";
}

function isoDate(daysFromToday = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function restHeaders(extra?: HeadersInit): HeadersInit {
  if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: restHeaders(init.headers),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`REST ${response.status} ${path}: ${body.slice(0, 240)}`);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

async function startLog(scope: string | null): Promise<number> {
  const rows = await rest<Array<{ id: number }>>("refresh_log?select=id", {
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

async function finishLog(args: {
  id: number;
  status: "success" | "partial";
  sitesSeen: number;
  sitesUpdated: number;
  nightsUpdated: number;
  durationMs: number;
  errors: string[];
}): Promise<void> {
  await rest(`refresh_log?id=eq.${args.id}`, {
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
    await rest("refresh_meta?on_conflict=refresh_type", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ refresh_type: "availability", last_success_at: new Date().toISOString() }),
    });
  }
}

async function loadTargets(opts: Required<Pick<RefreshRequest, "days" | "shardCount" | "shardIndex">> & RefreshRequest): Promise<Target[]> {
  let path = "availability_fetch_targets?select=*&order=site_id.asc";
  if (opts.operatorIds?.length) path += `&operator_id=in.(${opts.operatorIds.map(encodeURIComponent).join(",")})`;
  if (opts.missingOnly) {
    path += "&today_last_checked_at=is.null";
  } else if (opts.staleHours != null) {
    const cutoff = new Date(Date.now() - opts.staleHours * 60 * 60 * 1000).toISOString();
    path += `&or=(today_last_checked_at.is.null,today_last_checked_at.lte.${encodeURIComponent(cutoff)})`;
  }
  if (opts.shardCount <= 1 && opts.maxSites != null) path += `&limit=${opts.maxSites}`;

  let rows = await rest<Target[]>(path);

  if (opts.shardCount > 1) rows = rows.filter((_, i) => i % opts.shardCount === opts.shardIndex);
  if (opts.maxSites != null) rows = rows.slice(0, opts.maxSites);
  return rows;
}

async function upsertAvailability(rows: SiteNight[]): Promise<void> {
  if (rows.length === 0) return;
  await rest("site_availability?on_conflict=site_id,night_date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function fetchAvailability(target: Target, startDate: string, endDate: string): Promise<SiteNight[]> {
  const url = new URL(target.operator_base_url.replace(/\/+$/, "") + "/api/availability/resourceDailyAvailability");
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
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
      "Accept-Language": "en-CA,en;q=0.9",
      Referer: target.operator_base_url.replace(/\/+$/, "") + "/create-booking/",
      "X-Contact": "ontariocamps.app - scheduled Supabase availability refresh",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${url.hostname}${url.pathname}`);

  const data = await response.json() as Array<{ availability: number; processedAvailability?: number }>;
  const nowIso = new Date().toISOString();
  let night = startDate;
  return data.map((row) => {
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

async function handle(req: Request): Promise<Response> {
  const expectedKey = Deno.env.get("REFRESH_API_KEY");
  const actualKey = req.headers.get("x-refresh-key");
  if (expectedKey && actualKey !== expectedKey) return json(401, { error: "unauthorized" });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const started = Date.now();
  const body = await req.json().catch(() => ({})) as RefreshRequest;
  const opts = {
    days: Math.max(1, Math.min(180, Math.floor(body.days ?? 30))),
    staleHours: body.staleHours,
    missingOnly: Boolean(body.missingOnly),
    shardCount: Math.max(1, Math.floor(body.shardCount ?? 1)),
    shardIndex: Math.max(0, Math.floor(body.shardIndex ?? 0)),
    operatorIds: body.operatorIds,
    concurrency: Math.max(1, Math.min(8, Math.floor(body.concurrency ?? 3))),
    delayMs: Math.max(0, Math.floor(body.delayMs ?? 650)),
    maxSites: body.maxSites,
  };
  if (opts.shardIndex >= opts.shardCount) return json(400, { error: "shardIndex must be less than shardCount" });

  const scope = opts.operatorIds?.join(",") ?? `shard:${opts.shardIndex}/${opts.shardCount}`;
  const logId = await startLog(scope);
  const startDate = isoDate();
  const endDate = addDays(startDate, opts.days);
  const targets = await loadTargets(opts);
  const errors: string[] = [];
  let cursor = 0;
  let sitesUpdated = 0;
  let nightsUpdated = 0;
  const buffer: SiteNight[] = [];

  async function flush(force = false): Promise<void> {
    while (buffer.length >= 500 || (force && buffer.length > 0)) {
      const batch = buffer.splice(0, 500);
      await upsertAvailability(batch);
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= targets.length) return;
      const target = targets[index];
      try {
        await sleep(opts.delayMs + Math.floor(Math.random() * 200));
        const rows = await fetchAvailability(target, startDate, endDate);
        buffer.push(...rows);
        sitesUpdated += 1;
        nightsUpdated += rows.length;
        await flush();
      } catch (err) {
        errors.push(`site ${target.site_id}: ${(err as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency }, () => worker()));
  await flush(true);

  const status = errors.length ? "partial" : "success";
  await finishLog({
    id: logId,
    status,
    sitesSeen: targets.length,
    sitesUpdated,
    nightsUpdated,
    durationMs: Date.now() - started,
    errors,
  });

  return json(200, { status, sitesSeen: targets.length, sitesUpdated, nightsUpdated, errors: errors.slice(0, 10) });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error(err);
    return json(500, { error: (err as Error).message });
  }
});
