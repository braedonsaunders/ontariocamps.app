import { NextResponse } from "next/server";
import { recordRateLimitEvent } from "@/lib/db/queries";
import {
  cleanIdentifier,
  cleanIsoDate,
  rejectLargeBody,
  requestFingerprint,
  requireJsonPost,
  requireSameOriginPost,
} from "@/lib/security";

type RefreshBody = {
  parkId?: string;
  parkSlug?: string;
  siteId?: string;
  siteIds?: string[];
  startDate?: string;
  days?: number;
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function POST(request: Request) {
  const originError = requireSameOriginPost(request);
  if (originError) return originError;
  const typeError = requireJsonPost(request);
  if (typeError) return typeError;
  const sizeError = rejectLargeBody(request, 8_000);
  if (sizeError) return sizeError;

  const workerUrl = process.env.AVAILABILITY_WORKER_URL;
  const refreshKey = process.env.AVAILABILITY_REFRESH_KEY;
  if (!workerUrl || !refreshKey) {
    return NextResponse.json({ error: "availability refresh is not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as RefreshBody;
  const siteIds = Array.isArray(body.siteIds)
    ? body.siteIds.map(cleanIdentifier).filter((id): id is string => Boolean(id)).slice(0, 10)
    : cleanIdentifier(body.siteId)
      ? [cleanIdentifier(body.siteId)!]
      : undefined;
  const isSiteScoped = Boolean(siteIds?.length);
  const rateLimit = await recordRateLimitEvent({
    action: isSiteScoped ? "availability:site" : "availability:park",
    key: requestFingerprint(request, isSiteScoped ? "availability:site" : "availability:park"),
    limit: isSiteScoped ? 40 : 6,
    windowSeconds: 10 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "too many refresh requests" }, { status: 429 });
  }

  const payload = {
    mode: "ondemand",
    parkId: cleanIdentifier(body.parkId),
    parkSlug: cleanIdentifier(body.parkSlug),
    siteIds,
    startDate: cleanIsoDate(body.startDate),
    days: clampInt(body.days, isSiteScoped ? 30 : 14, 1, isSiteScoped ? 31 : 21),
    staleMinutes: isSiteScoped ? 1 : 3,
    maxSites: isSiteScoped ? siteIds?.length : 120,
    concurrency: isSiteScoped ? 4 : 3,
    delayMs: isSiteScoped ? 150 : 450,
    skipRollups: true,
  };

  if (!payload.parkId && !payload.parkSlug && !payload.siteIds?.length) {
    return NextResponse.json({ error: "parkId, parkSlug, siteId, or siteIds is required" }, { status: 400 });
  }

  const endpoint = new URL("/refresh", workerUrl.replace(/\/+$/, "") + "/");
  if (process.env.NODE_ENV === "production" && endpoint.protocol !== "https:") {
    return NextResponse.json({ error: "availability refresh endpoint must use https" }, { status: 500 });
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-refresh-key": refreshKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return NextResponse.json({ error: "availability refresh failed" }, { status: 502 });
  }
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: response.ok ? "invalid availability refresh response" : "availability refresh failed" };
  }
  return NextResponse.json(data, { status: response.ok ? 200 : response.status });
}
