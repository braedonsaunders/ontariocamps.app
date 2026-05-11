/**
 * One-shot: walk every park's /api/maps response and pull mapLegendItems +
 * mapLabels + mapAccessPointResources into camp_maps.features. These are the
 * washrooms, water taps, beach access points, etc. that the operator plots
 * on its branded map alongside the bookable sites.
 *
 * Run: npx tsx scripts/backfill-map-features.ts
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
  mapLegendItems?: Array<{
    mapLegendItemId: number;
    legendItemType: number;
    iconType: number;
    xCoordinate: number;
    yCoordinate: number;
    rValue: number; gValue: number; bValue: number;
  }>;
  mapLabels?: Array<{
    mapLabelId?: number;
    xCoordinate: number;
    yCoordinate: number;
    localizedValues?: Array<{ cultureName: string; label?: string; text?: string; name?: string }>;
    rValue?: number; gValue?: number; bValue?: number;
    fontSize?: number;
  }>;
  mapAccessPointResources?: Array<{
    resourceId?: number;
    iconType?: number;
    xCoordinate: number;
    yCoordinate: number;
  }>;
};

type Feature =
  | { kind: "legend"; x: number; y: number; r: number; g: number; b: number; legendItemType: number; iconType: number }
  | { kind: "label"; x: number; y: number; text: string | null; r?: number; g?: number; b?: number; fontSize?: number }
  | { kind: "access"; x: number; y: number; iconType?: number };

async function fetchMaps(baseUrl: string, resourceLocationId: string): Promise<CamisMap[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/maps?resourceLocationId=${resourceLocationId}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Referer: baseUrl + "/create-booking/" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json() as CamisMap[];
}

function buildFeatures(m: CamisMap): Feature[] {
  const out: Feature[] = [];
  for (const li of m.mapLegendItems ?? []) {
    out.push({
      kind: "legend",
      x: li.xCoordinate,
      y: li.yCoordinate,
      r: li.rValue,
      g: li.gValue,
      b: li.bValue,
      legendItemType: li.legendItemType,
      iconType: li.iconType,
    });
  }
  for (const ml of m.mapLabels ?? []) {
    const en = ml.localizedValues?.find((l) => l.cultureName === "en-CA") ?? ml.localizedValues?.[0];
    const text = (en?.label ?? en?.text ?? en?.name ?? "").trim() || null;
    out.push({
      kind: "label",
      x: ml.xCoordinate,
      y: ml.yCoordinate,
      text,
      r: ml.rValue,
      g: ml.gValue,
      b: ml.bValue,
      fontSize: ml.fontSize,
    });
  }
  for (const ap of m.mapAccessPointResources ?? []) {
    out.push({ kind: "access", x: ap.xCoordinate, y: ap.yCoordinate, iconType: ap.iconType });
  }
  return out;
}

async function main() {
  const parks = await sql<Array<{
    id: string; vendor_park_id: string; name: string; base_url: string;
  }>>`
    SELECT p.id, p.vendor_park_id, p.name, o.base_url
      FROM parks p JOIN operators o ON o.id = p.operator_id
     ORDER BY p.operator_id, p.name
  `;
  console.log(`Walking ${parks.length} parks…`);
  let polite = 0;
  let totalFeatures = 0;
  let mapsUpdated = 0;

  for (let i = 0; i < parks.length; i++) {
    const p = parks[i];
    let maps: CamisMap[];
    try {
      polite++;
      if (polite % 5 === 0) await new Promise((r) => setTimeout(r, 250));
      maps = await fetchMaps(p.base_url, p.vendor_park_id);
    } catch (err) {
      console.error(`  skip ${p.name}: ${(err as Error).message}`);
      continue;
    }
    for (const m of maps) {
      const features = buildFeatures(m);
      if (features.length === 0) continue;
      const campMapId = `cm_${p.id}_${m.mapId}`;
      const result = await sql`
        UPDATE camp_maps SET features = ${sql.json(features)} WHERE id = ${campMapId}
      `;
      if (result.count > 0) {
        mapsUpdated += 1;
        totalFeatures += features.length;
      }
    }
    if (i % 25 === 24 || i === parks.length - 1) {
      console.log(`  ${i + 1}/${parks.length} parks · ${mapsUpdated} maps with features · ${totalFeatures} features total`);
    }
  }
  console.log(`\nDone. Plotted ${totalFeatures} features across ${mapsUpdated} maps.`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
