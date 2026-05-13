import { NextResponse } from "next/server";
import {
  getParkBySlug,
  getParkReviews,
  getParkReviewAggregate,
  getRecentSiteReviewsForPark,
} from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parkReviewAggregate = await getParkReviewAggregate(park.id);
  if (parkReviewAggregate.review_count === 0) {
    return NextResponse.json({
      parkReviews: [],
      parkReviewAggregate,
      recentSiteReviews: [],
    });
  }

  const [parkReviews, recentSiteReviews] = await Promise.all([
    getParkReviews(park.id),
    getRecentSiteReviewsForPark(park.id),
  ]);

  return NextResponse.json({
    parkReviews,
    parkReviewAggregate,
    recentSiteReviews,
  });
}
