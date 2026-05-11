/**
 * One-shot: walk every park's /api/maps response and write the proper
 * `title` (campground section name like "Campground 1") and `description`
 * ("Sites 1-23") onto each camp_maps row.
 *
 * The CAMIS metadata payload puts the section label in `title`, but the old
 * ingest read `name` — which is never set on map rows — so every camp_maps
 * row in the DB has a null name.
 *
 * Run: npx tsx scripts/backfill-campmap-names.ts
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

type CamisMap = {
  mapId: number;
  localizedValues?: Array<{
    cultureName: string;
    title?: string;
    name?: string;
    description?: string;
  }>;
};

async function fetchMaps(baseUrl: string, resourceLocationId: string): Promise<CamisMap[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/maps?resourceLocationId=${resourceLocationId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: baseUrl + "/create-booking/",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json() as CamisMap[];
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
  let totalMapsUpdated = 0;
  let totalNamed = 0;
  let polite = 0;

  for (let i = 0; i < parks.length; i++) {
    const p = parks[i];
    let maps: CamisMap[];
    try {
      // Tiny polite delay between hosts shared by the operator
      polite++;
      if (polite % 4 === 0) await new Promise((r) => setTimeout(r, 250));
      maps = await fetchMaps(p.base_url, p.vendor_park_id);
    } catch (err) {
      console.error(`  skip ${p.name}: ${(err as Error).message}`);
      continue;
    }

    let parkUpdated = 0;
    for (const m of maps) {
      const en = m.localizedValues?.find((l) => l.cultureName === "en-CA")
        ?? m.localizedValues?.[0];
      const title = en?.title ?? en?.name ?? null;
      const description = en?.description ?? null;
      if (!title && !description) continue;
      const campMapId = `cm_${p.id}_${m.mapId}`;
      const r = await sql`
        UPDATE camp_maps
           SET name        = COALESCE(${title}, name),
               description = COALESCE(${description}, description)
         WHERE id = ${campMapId}
      `;
      if (r.count > 0) {
        parkUpdated += 1;
        if (title) totalNamed += 1;
      }
    }
    totalMapsUpdated += parkUpdated;

    if (i % 25 === 24 || i === parks.length - 1) {
      console.log(`  ${i + 1}/${parks.length} parks · ${totalMapsUpdated} maps updated`);
    }
  }

  console.log(`\nDone. Named ${totalNamed} maps across ${totalMapsUpdated} updates.`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
