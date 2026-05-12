import { NextRequest, NextResponse } from "next/server";
import { getParkReviews, getParkReviewAggregate, insertParkReview, recordRateLimitEvent } from "@/lib/db/queries";
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
  const parkId = req.nextUrl.searchParams.get("park_id");
  if (!parkId) return NextResponse.json({ error: "park_id required" }, { status: 400 });

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0");

  const [reviews, aggregate] = await Promise.all([
    getParkReviews(parkId, limit, offset),
    getParkReviewAggregate(parkId),
  ]);

  return NextResponse.json({ reviews, aggregate });
}

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
  const parkId = cleanIdentifier(data.park_id);
  if (!parkId || !data.author_handle || !data.overall || !data.body) {
    return NextResponse.json({ error: "park_id, author_handle, overall, and body are required" }, { status: 400 });
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

  const submitterHash = requestFingerprint(req, "park-review");
  const rateLimit = await recordRateLimitEvent({
    action: "review:park",
    key: submitterHash,
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "too many review submissions" }, { status: 429 });
  }

  try {
    const id = await insertParkReview({
      park_id: parkId,
      author_handle: handle,
      overall,
      facilities: validateRating(data.facilities),
      trails: validateRating(data.trails),
      beach: validateRating(data.beach),
      privacy: validateRating(data.privacy),
      noise: validateRating(data.noise),
      title: data.title ? String(data.title).trim().slice(0, 120) : undefined,
      body: b,
      visited_at: cleanPastIsoDate(data.visited_at),
      submitter_hash: submitterHash,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err: unknown) {
    console.error("park review insert failed", err);
    return NextResponse.json({ error: "review could not be saved" }, { status: 500 });
  }
}
