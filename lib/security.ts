import { createHmac } from "crypto";
import { NextResponse } from "next/server";

const DEFAULT_ALLOWED_HOSTS = new Set([
  "ontariocamps.app",
  "www.ontariocamps.app",
  "localhost:4000",
  "localhost:3000",
  "127.0.0.1:4000",
  "127.0.0.1:3000",
]);

function configuredHosts(): Set<string> {
  const hosts = new Set(DEFAULT_ALLOWED_HOSTS);
  for (const raw of (process.env.ALLOWED_ORIGINS ?? "").split(",")) {
    const value = raw.trim();
    if (!value) continue;
    try {
      hosts.add(new URL(value).host.toLowerCase());
    } catch {
      hosts.add(value.replace(/^https?:\/\//, "").toLowerCase());
    }
  }
  return hosts;
}

function requestHost(request: Request): string {
  return (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host
  ).toLowerCase();
}

export function requireSameOriginPost(request: Request): NextResponse | null {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return null;

  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) {
    return NextResponse.json({ error: "same-origin request required" }, { status: 403 });
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  }

  const host = requestHost(request);
  if (originHost === host || configuredHosts().has(originHost)) return null;
  return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
}

export function requireJsonPost(request: Request): NextResponse | null {
  if (request.method !== "POST") return null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) return null;
  return NextResponse.json({ error: "application/json required" }, { status: 415 });
}

export function rejectLargeBody(request: Request, maxBytes = 20_000): NextResponse | null {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    return NextResponse.json({ error: "request body too large" }, { status: 413 });
  }
  return null;
}

export function requestFingerprint(request: Request, purpose: string): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const ua = (request.headers.get("user-agent") ?? "unknown").slice(0, 160);
  const secret =
    process.env.APP_RATE_LIMIT_SECRET ??
    process.env.REVIEW_HASH_SECRET ??
    process.env.AVAILABILITY_REFRESH_KEY ??
    process.env.DATABASE_URL ??
    "local-development-only";

  return createHmac("sha256", secret).update(`${purpose}|${ip}|${ua}`).digest("hex").slice(0, 40);
}

export function cleanIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9_:-]+$/.test(value) ? value : undefined;
}

export function cleanIsoDate(value: unknown, futureDays = 365): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return undefined;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (parsed < todayUtc) return undefined;
  if (parsed > todayUtc + futureDays * 24 * 60 * 60 * 1000) return undefined;
  return value;
}

export function cleanPastIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return undefined;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (parsed > todayUtc) return undefined;
  return value;
}
