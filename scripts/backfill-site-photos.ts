/**
 * One-shot: hit /api/resourcelocation/resources for every park and write the
 * per-site `photos` array + `description` blurb onto each `sites` row.
 *
 * The endpoint returns a `{ resourceId: ResourceDetail }` dict for every site
 * in the park — so it's one HTTP call per park (149 total) instead of
 * 24k calls per site.
 *
 * Run: npx tsx scripts/backfill-site-photos.ts
 */

import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const URL = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!URL) throw new Error("DATABASE_DIRECT_URL not set");

const sql = postgres(URL, { ssl: "require", prepare: false, max: 4 });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";

type ResourceDetail = {
  resourceId: number;
  localizedValues?: Array<{ cultureName: string; name?: string; description?: string }>;
  photos?: Array<{
    photoUrlResult?: { url?: string; avifUrl?: string };
    aspectType?: number;
  }>;
};

async function fetchResources(baseUrl: string, resourceLocationId: string): Promise<Record<string, ResourceDetail>> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/resourcelocation/resources?resourceLocationId=${resourceLocationId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: baseUrl + "/create-booking/booking-details",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json() as Record<string, ResourceDetail>;
}

function stripHtml(s: string | undefined | null): string | null {
  if (!s) return null;
  const cleaned = s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

async function main() {
  const parks = await sql<Array<{
    id: string; operator_id: string; vendor_park_id: string; name: string; base_url: string;
  }>>`
    SELECT p.id, p.operator_id, p.vendor_park_id, p.name, o.base_url
      FROM parks p JOIN operators o ON o.id = p.operator_id
     ORDER BY p.operator_id, p.name
  `;

  console.log(`Walking ${parks.length} parks…`);
  let totalSitesUpdated = 0;
  let totalSitesWithPhotos = 0;
  let polite = 0;

  for (let i = 0; i < parks.length; i++) {
    const p = parks[i];
    let resources: Record<string, ResourceDetail>;
    try {
      polite++;
      if (polite % 5 === 0) await new Promise((r) => setTimeout(r, 200));
      resources = await fetchResources(p.base_url, p.vendor_park_id);
    } catch (err) {
      console.error(`  skip ${p.name}: ${(err as Error).message}`);
      continue;
    }

    let parkUpdated = 0;
    let parkWithPhotos = 0;

    for (const r of Object.values(resources)) {
      const en = r.localizedValues?.find((l) => l.cultureName === "en-CA")
        ?? r.localizedValues?.[0];
      const description = stripHtml(en?.description);
      // Normalise the photos array: drop the wrapper, keep just { url, avifUrl, aspectType }.
      const photos = (r.photos ?? [])
        .map((ph) => ({
          url: ph.photoUrlResult?.url ?? null,
          avifUrl: ph.photoUrlResult?.avifUrl ?? null,
          aspectType: ph.aspectType ?? 0,
        }))
        .filter((ph) => ph.url || ph.avifUrl);

      if (photos.length === 0 && !description) continue;

      // sites.id format: s_${parkId}_${resourceId}
      const siteId = `s_${p.id}_${r.resourceId}`;
      const result = await sql`
        UPDATE sites
           SET photos      = ${sql.json(photos)},
               description = COALESCE(NULLIF(${description}, ''), description)
         WHERE id = ${siteId}
      `;
      if (result.count > 0) {
        parkUpdated += 1;
        if (photos.length > 0) parkWithPhotos += 1;
      }
    }

    totalSitesUpdated += parkUpdated;
    totalSitesWithPhotos += parkWithPhotos;

    if (i % 20 === 19 || i === parks.length - 1) {
      console.log(
        `  ${i + 1}/${parks.length} parks · ${totalSitesUpdated} sites updated, ${totalSitesWithPhotos} with photos`,
      );
    }
  }

  console.log(`\nDone. ${totalSitesWithPhotos} sites now have at least one photo.`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
