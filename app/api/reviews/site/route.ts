import { NextRequest, NextResponse } from "next/server";
import { getSiteReviews, getSiteReviewAggregate, insertSiteReview } from "@/lib/db/queries";
import { createHash } from "crypto";

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
  const body = await req.json();

  if (!body.site_id || !body.author_handle || !body.overall || !body.body) {
    return NextResponse.json({ error: "site_id, author_handle, overall, and body are required" }, { status: 400 });
  }

  const handle = String(body.author_handle).trim().slice(0, 40);
  if (handle.length < 2) {
    return NextResponse.json({ error: "author_handle must be 2-40 characters" }, { status: 400 });
  }

  const overall = Number(body.overall);
  if (!Number.isInteger(overall) || overall < 1 || overall > 5) {
    return NextResponse.json({ error: "overall must be 1-5" }, { status: 400 });
  }

  const b = String(body.body).trim();
  if (b.length < 10 || b.length > 2000) {
    return NextResponse.json({ error: "body must be 10-2000 characters" }, { status: 400 });
  }

  const validateRating = (v: unknown): number | undefined => {
    if (v === null || v === undefined) return undefined;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
  };

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const submitterHash = createHash("sha256").update(ip).digest("hex").slice(0, 32);

  try {
    const id = await insertSiteReview({
      site_id: body.site_id,
      author_handle: handle,
      overall,
      privacy: validateRating(body.privacy),
      cleanliness: validateRating(body.cleanliness),
      noise: validateRating(body.noise),
      site_size: validateRating(body.site_size),
      shade: validateRating(body.shade),
      title: body.title ? String(body.title).trim().slice(0, 120) : undefined,
      body: b,
      visited_at: body.visited_at || undefined,
      submitter_hash: submitterHash,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "insert failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
