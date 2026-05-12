import { NextRequest, NextResponse } from "next/server";
import { getSiteReviews, getSiteReviewAggregate, insertSiteReview, recordRateLimitEvent } from "@/lib/db/queries";
import {
  cleanIdentifier,
  cleanPastIsoDate,
  rejectLargeBody,
  requestFingerprint,
  requireJsonPost,
  requireSameOriginPost,
} from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0");

  const [reviews, aggregate] = await Promise.all([
    getSiteReviews(siteId, limit, offset),
    getSiteReviewAggregate(siteId),
  ]);

  return NextResponse.json({ reviews, aggregate });
}

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const originError = requireSameOriginPost(req);
  if (originError) return originError;
  const typeError = requireJsonPost(req);
  if (typeError) return typeError;
  const sizeError = rejectLargeBody(req, 8_000);
  if (sizeError) return sizeError;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const siteId = cleanIdentifier(data.site_id);
  if (!siteId || !data.author_handle || !data.overall || !data.body) {
    return NextResponse.json({ error: "site_id, author_handle, overall, and body are required" }, { status: 400 });
  }

  const handle = String(data.author_handle).trim().slice(0, 40);
  if (handle.length < 2) {
    return NextResponse.json({ error: "author_handle must be 2-40 characters" }, { status: 400 });
  }

  const overall = Number(data.overall);
  if (!Number.isInteger(overall) || overall < 1 || overall > 5) {
    return NextResponse.json({ error: "overall must be 1-5" }, { status: 400 });
  }

  const b = String(data.body).trim();
  if (b.length < 10 || b.length > 2000) {
    return NextResponse.json({ error: "body must be 10-2000 characters" }, { status: 400 });
  }

  const validateRating = (v: unknown): number | undefined => {
    if (v === null || v === undefined) return undefined;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
  };

  const submitterHash = requestFingerprint(req, "site-review");
  const rateLimit = await recordRateLimitEvent({
    action: "review:site",
    key: submitterHash,
    limit: 3,
    windowSeconds: RATE_LIMIT_WINDOW_MS / 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "too many review submissions" }, { status: 429 });
  }

  try {
    const id = await insertSiteReview({
      site_id: siteId,
      author_handle: handle,
      overall,
      privacy: validateRating(data.privacy),
      cleanliness: validateRating(data.cleanliness),
      noise: validateRating(data.noise),
      site_size: validateRating(data.site_size),
      shade: validateRating(data.shade),
      title: data.title ? String(data.title).trim().slice(0, 120) : undefined,
      body: b,
      visited_at: cleanPastIsoDate(data.visited_at),
      submitter_hash: submitterHash,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err: unknown) {
    console.error("site review insert failed", err);
    return NextResponse.json({ error: "review could not be saved" }, { status: 500 });
  }
}
