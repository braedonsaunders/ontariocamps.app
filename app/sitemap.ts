import type { MetadataRoute } from "next";
import { sql } from "@/lib/db/client";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

type SitemapEntry = MetadataRoute.Sitemap[number];

type ParkSitemapRow = {
  slug: string;
  last_modified: Date | string | null;
};

type OperatorSitemapRow = {
  id: string;
  last_modified: Date | string | null;
};

function entry(
  path: string,
  options: Pick<SitemapEntry, "changeFrequency" | "priority"> & { lastModified?: Date | string | null },
): SitemapEntry {
  const item: SitemapEntry = {
    url: absoluteUrl(path),
    changeFrequency: options.changeFrequency,
    priority: options.priority,
  };

  if (options.lastModified) item.lastModified = options.lastModified;
  return item;
}

function staticEntries(lastModified?: Date | string | null): MetadataRoute.Sitemap {
  return [
    entry("/", { changeFrequency: "hourly", priority: 1, lastModified }),
    entry("/search", { changeFrequency: "hourly", priority: 0.95, lastModified }),
    entry("/parks", { changeFrequency: "daily", priority: 0.9, lastModified }),
    entry("/map", { changeFrequency: "daily", priority: 0.8, lastModified }),
    entry("/analytics", { changeFrequency: "hourly", priority: 0.65, lastModified }),
    entry("/data", { changeFrequency: "hourly", priority: 0.6, lastModified }),
    entry("/about", { changeFrequency: "monthly", priority: 0.4 }),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const [parks, operators, freshness] = await Promise.all([
      sql()<ParkSitemapRow[]>`
        SELECT p.slug,
               COALESCE(o.last_availability_at, o.last_metadata_at) AS last_modified
          FROM parks p
          JOIN operators o ON o.id = p.operator_id
         WHERE p.slug IS NOT NULL
         ORDER BY p.total_sites DESC NULLS LAST, p.name
      `,
      sql()<OperatorSitemapRow[]>`
        SELECT id, COALESCE(last_availability_at, last_metadata_at) AS last_modified
          FROM operators
         WHERE active = true
         ORDER BY total_sites DESC NULLS LAST, name
      `,
      sql()<Array<{ last_modified: Date | string | null }>>`
        SELECT max(COALESCE(last_availability_at, last_metadata_at)) AS last_modified
          FROM operators
         WHERE active = true
      `,
    ]);

    return [
      ...staticEntries(freshness[0]?.last_modified ?? null),
      ...operators.map((operator) =>
        entry(`/operator/${operator.id}`, {
          changeFrequency: "daily",
          priority: 0.75,
          lastModified: operator.last_modified,
        }),
      ),
      ...parks.map((park) =>
        entry(`/park/${park.slug}`, {
          changeFrequency: "daily",
          priority: 0.85,
          lastModified: park.last_modified,
        }),
      ),
    ];
  } catch (error) {
    console.error("Unable to build dynamic sitemap entries", error);
    return staticEntries();
  }
}
