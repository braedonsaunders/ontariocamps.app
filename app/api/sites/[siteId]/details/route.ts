import { NextResponse } from "next/server";
import { buildBookingUrl } from "@/lib/booking-url";
import { sql } from "@/lib/db/client";
import {
  getEquipmentForOperator,
  getSiteAvailability,
  getSiteReviewAggregate,
  getSiteReviews,
} from "@/lib/data-source";
import type { Site } from "@/lib/types";

export const dynamic = "force-dynamic";

type SiteDetailsRow = {
  id: string;
  campground_id: string;
  vendor_site_id: string;
  name: string;
  site_type: string;
  site_type_label: string | null;
  icon_type: number | null;
  min_party_size: number | null;
  max_party_size: number;
  max_stay_nights: number | null;
  max_equipment_length_ft: number | null;
  has_electric: boolean;
  has_water: boolean;
  has_sewer: boolean;
  is_pull_through: boolean;
  is_accessible: boolean;
  is_pet_friendly: boolean;
  is_waterfront: boolean;
  amenities: string[];
  camp_map_id: string | null;
  map_x: number | null;
  map_y: number | null;
  photos: unknown;
  description: string | null;
  defined_attributes: unknown;
  allowed_equipment: unknown;
  rule_summary: unknown;
  park_id: string;
  park_slug: string;
  park_name: string;
  operator_id: string;
  operator_name: string;
  vendor_url: string;
  vendor_map_id: string | null;
};

function rowToSite(row: SiteDetailsRow): Site {
  return {
    id: row.id,
    campground_id: row.campground_id,
    vendor_site_id: row.vendor_site_id,
    name: row.name,
    site_type: row.site_type as Site["site_type"],
    site_type_label: row.site_type_label,
    icon_type: row.icon_type,
    min_party_size: row.min_party_size,
    max_party_size: row.max_party_size,
    max_stay_nights: row.max_stay_nights,
    max_equipment_length_ft: row.max_equipment_length_ft,
    has_electric: row.has_electric,
    has_water: row.has_water,
    has_sewer: row.has_sewer,
    is_pull_through: row.is_pull_through,
    is_accessible: row.is_accessible,
    is_pet_friendly: row.is_pet_friendly,
    is_waterfront: row.is_waterfront,
    amenities: Array.isArray(row.amenities) ? row.amenities : [],
    camp_map_id: row.camp_map_id,
    map_x: row.map_x,
    map_y: row.map_y,
    photos: Array.isArray(row.photos) ? (row.photos as Site["photos"]) : [],
    description: row.description,
    defined_attributes: Array.isArray(row.defined_attributes) ? (row.defined_attributes as Site["defined_attributes"]) : [],
    allowed_equipment: Array.isArray(row.allowed_equipment) ? (row.allowed_equipment as Site["allowed_equipment"]) : [],
    rule_summary: row.rule_summary && typeof row.rule_summary === "object" ? (row.rule_summary as Site["rule_summary"]) : null,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const rows = await sql()<SiteDetailsRow[]>`
    SELECT
      s.id,
      s.campground_id,
      s.vendor_site_id,
      s.name,
      s.site_type,
      s.site_type_label,
      s.icon_type,
      s.min_party_size,
      s.max_party_size,
      s.max_stay_nights,
      s.max_equipment_length_ft,
      s.has_electric,
      s.has_water,
      s.has_sewer,
      s.is_pull_through,
      s.is_accessible,
      s.is_pet_friendly,
      s.is_waterfront,
      s.amenities,
      s.camp_map_id,
      s.map_x,
      s.map_y,
      s.photos,
      s.description,
      s.defined_attributes,
      s.allowed_equipment,
      s.rule_summary,
      p.id AS park_id,
      p.slug AS park_slug,
      p.name AS park_name,
      p.operator_id,
      o.name AS operator_name,
      p.vendor_url,
      cm.vendor_map_id
    FROM sites s
    JOIN campgrounds c ON c.id = s.campground_id
    JOIN parks p ON p.id = c.park_id
    JOIN operators o ON o.id = p.operator_id
    LEFT JOIN camp_maps cm ON cm.id = s.camp_map_id
    WHERE s.id = ${siteId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const [availability, equipment, reviewAggregate, recentReviews] = await Promise.all([
    getSiteAvailability(siteId),
    getEquipmentForOperator(row.operator_id),
    getSiteReviewAggregate(siteId),
    getSiteReviews(siteId, 5),
  ]);

  let lastCheckedAt: string | null = null;
  let availableNights = 0;
  let reservedNights = 0;
  const nights: Record<string, "available" | "reserved" | "closed" | "unknown"> = {};
  for (const night of availability) {
    nights[night.night_date] = night.status as "available" | "reserved" | "closed" | "unknown";
    if (night.status === "available") availableNights++;
    if (night.status === "reserved") reservedNights++;
    if (!lastCheckedAt || night.last_checked_at > lastCheckedAt) lastCheckedAt = night.last_checked_at;
  }

  const site = rowToSite(row);
  return NextResponse.json({
    details: {
      site,
      parkName: row.park_name,
      parkSlug: row.park_slug,
      operatorName: row.operator_name,
      operatorId: row.operator_id,
      bookingUrl: buildBookingUrl(row.vendor_url, {
        resourceId: row.vendor_site_id,
        mapId: row.vendor_map_id ?? undefined,
      }),
      equipment,
      calendarRow: {
        site: {
          id: site.id,
          name: site.name,
          site_type: site.site_type,
          site_type_label: site.site_type_label ?? null,
          has_electric: site.has_electric,
        },
        nights,
      },
      lastCheckedAt,
      stats: {
        id: site.id,
        vendorSiteId: site.vendor_site_id,
        name: site.name,
        siteTypeLabel: site.site_type_label ?? site.site_type,
        hasElectric: site.has_electric,
        isWaterfront: site.is_waterfront,
        isPetFriendly: site.is_pet_friendly,
        totalNights: availability.length,
        availableNights,
        reservedNights,
        reviewCount: reviewAggregate.review_count,
        ratingAvg: reviewAggregate.rating_avg,
      },
      recentReviews: recentReviews.map((review) => ({ ...review, site_name: site.name })),
    },
  });
}
