/**
 * One-shot: for every operator, hit /api/resourceLocation and update
 * parks.hero_image_url + parks.description with the live photos & blurbs from
 * the Camis API.
 *
 * Run: npx tsx scripts/backfill-park-photos.ts
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

type ResourceLocation = {
  resourceLocationId: number;
  region: string | null;
  photos?: Array<{ photoUrlResult?: { url?: string; avifUrl?: string }; aspectType?: number }>;
  localizedValues?: Array<{
    cultureName: string;
    fullName?: string;
    shortName?: string;
    description?: string;
    streetAddress?: string;
    city?: string;
    website?: string;
  }>;
};

function stripHtml(s: string | undefined | null): string | null {
  if (!s) return null;
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    || null;
}

async function fetchResourceLocations(baseUrl: string): Promise<ResourceLocation[]> {
  const res = await fetch(baseUrl.replace(/\/+$/, "") + "/api/resourceLocation", {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Accept-Language": "en-CA,en;q=0.9",
      Referer: baseUrl + "/",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${baseUrl}/api/resourceLocation`);
  return await res.json() as ResourceLocation[];
}

async function main() {
  const operators = await sql<Array<{ id: string; name: string; base_url: string }>>`
    SELECT id, name, base_url FROM operators WHERE active = true ORDER BY name
  `;

  for (const op of operators) {
    console.log(`\n=== ${op.id} (${op.name}) ===`);
    let rls: ResourceLocation[];
    try {
      rls = await fetchResourceLocations(op.base_url);
    } catch (err) {
      console.error(`  skip: ${(err as Error).message}`);
      continue;
    }
    console.log(`  fetched ${rls.length} resourceLocations`);

    let updated = 0;
    let withPhoto = 0;

    for (const rl of rls) {
      const en = rl.localizedValues?.find((l) => l.cultureName === "en-CA")
        ?? rl.localizedValues?.[0];
      const photo = rl.photos?.[0]?.photoUrlResult?.url;
      const description = stripHtml(en?.description);
      const address = [en?.streetAddress, en?.city].filter(Boolean).join(", ").trim() || null;

      if (!photo && !description && !address) continue;

      const result = await sql`
        UPDATE parks
           SET hero_image_url = COALESCE(${photo ?? null}, hero_image_url),
               description    = COALESCE(NULLIF(${description}, ''), description),
               address        = COALESCE(NULLIF(${address}, ''), address)
         WHERE operator_id = ${op.id}
           AND vendor_park_id = ${String(rl.resourceLocationId)}
      `;
      if (result.count > 0) {
        updated += 1;
        if (photo) withPhoto += 1;
      }
    }
    console.log(`  updated ${updated} parks (${withPhoto} with photos)`);
  }

  console.log("\nDone.");
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
