import type { Metadata } from "next";
import { sql } from "@/lib/db/client";
import { ParksDirectory } from "@/components/parks-directory";

export const metadata: Metadata = {
  title: "Parks",
  description: "Browse every Ontario park and campground network indexed by ontariocamps.app.",
  alternates: {
    canonical: "/parks",
  },
};
export const dynamic = "force-dynamic";

type OperatorRow = {
  id: string;
  name: string;
  vendor: string;
  base_url: string;
  website_url: string | null;
  logo_url: string | null;
  accent_color: string | null;
  tagline: string | null;
  total_parks: number;
  total_sites: number;
  available_sites: number;
  last_availability_at: Date | string | null;
  hero_image_url: string | null;
  featured_park: string | null;
};

type ParkRow = {
  slug: string;
  name: string;
  operator_id: string;
  operator: string;
  region: string;
  hero_image_url: string | null;
  total_sites: number;
  available_sites: number;
  availability_pct: number;
  accent_color: string | null;
};

export default async function ParksPage() {
  const [operators, parks] = await Promise.all([
    sql()<OperatorRow[]>`
      SELECT o.id, o.name, o.vendor, o.base_url, o.website_url, o.logo_url, o.accent_color, o.tagline,
             o.total_parks, o.total_sites, o.available_sites, o.last_availability_at,
             COALESCE(o.hero_image_url, hero.hero_image_url) AS hero_image_url,
             hero.featured_park
        FROM operators o
        LEFT JOIN LATERAL (
          SELECT p.hero_image_url, p.name AS featured_park
            FROM parks p
           WHERE p.operator_id = o.id
             AND p.hero_image_url IS NOT NULL
           ORDER BY p.total_sites DESC NULLS LAST
           LIMIT 1
        ) hero ON true
       ORDER BY o.total_sites DESC
    `,
    sql()<ParkRow[]>`
      SELECT p.slug, p.name, p.operator_id, o.name AS operator,
             COALESCE(NULLIF(p.region, ''), 'Ontario') AS region,
             p.hero_image_url,
             p.total_sites, p.available_sites,
             CASE WHEN p.total_sites > 0 THEN (100.0 * p.available_sites / p.total_sites)::int ELSE 0 END AS availability_pct,
             o.accent_color
        FROM parks p
        JOIN operators o ON o.id = p.operator_id
       WHERE p.total_sites > 0
       ORDER BY p.total_sites DESC, p.name
    `,
  ]);

  return <ParksDirectory operators={operators} parks={parks} />;
}
