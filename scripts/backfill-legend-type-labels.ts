import postgres from "postgres";
import fs from "fs";

const envPath = ".env.local";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const URL = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!URL) throw new Error("DATABASE_DIRECT_URL not set");
const sql = postgres(URL, { ssl: "require", prepare: false, max: 2 });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";

const OPERATORS = [
  { id: "ontario_parks", baseUrl: "https://reservations.ontarioparks.com" },
  { id: "parks_canada", baseUrl: "https://reservation.pc.gc.ca" },
  { id: "long_point_ca", baseUrl: "https://longpoint.goingtocamp.com" },
  { id: "st_clair_ca", baseUrl: "https://stclair.goingtocamp.com" },
  { id: "otonabee_ca", baseUrl: "https://otonabee.goingtocamp.com" },
  { id: "niagara_peninsula_ca", baseUrl: "https://npca.goingtocamp.com" },
  { id: "trca_ca", baseUrl: "https://trca.goingtocamp.com" },
  { id: "grand_river_ca", baseUrl: "https://grandriver.goingtocamp.com" },
  { id: "upper_thames_ca", baseUrl: "https://upperthames.goingtocamp.com" },
  { id: "maitland_valley_ca", baseUrl: "https://maitlandvalley.goingtocamp.com" },
  { id: "catfish_creek_ca", baseUrl: "https://catfishcreek.goingtocamp.com" },
];

async function fetchLegendTypes(
  baseUrl: string,
  types: number[],
): Promise<Array<{ legendItemType: number; localizationKey: string }>> {
  const url = `${baseUrl}/api/maps/legendicons?mapLegendTypes=${encodeURIComponent(JSON.stringify(types))}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Referer: baseUrl + "/create-booking/" },
  });
  if (!res.ok) {
    console.warn(`  ${baseUrl} → HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as Array<{
    legendItemType: number;
    localizationKey: string;
    encodedImage?: string;
  }>;
  return data.map((d) => ({ legendItemType: d.legendItemType, localizationKey: d.localizationKey }));
}

async function main() {
  const allTypes = await sql`
    SELECT DISTINCT (feat->>'legendItemType')::int as lit
    FROM camp_maps, jsonb_array_elements(features) as feat
    WHERE feat->>'kind' = 'legend'
  `;
  const typeIds = allTypes.map((r: any) => r.lit);
  console.log(`Found ${typeIds.length} distinct legendItemType values`);

  let totalInserted = 0;
  for (const op of OPERATORS) {
    console.log(`\nFetching from ${op.id} (${op.baseUrl})…`);
    let results: Array<{ legendItemType: number; localizationKey: string }>;
    try {
      results = await fetchLegendTypes(op.baseUrl, typeIds);
    } catch (err) {
      console.warn(`  skip: ${(err as Error).message}`);
      continue;
    }
    if (results.length === 0) {
      console.log("  no results");
      continue;
    }
    for (const r of results) {
      const label = r.localizationKey
        .replace(/([A-Z])/g, " $1")
        .replace(/^OP\s*/, "")
        .replace(/\d+$/, "")
        .trim();
      await sql`
        INSERT INTO legend_type_labels (operator_id, legend_item_type, localization_key, label)
        VALUES (${op.id}, ${r.legendItemType}, ${r.localizationKey}, ${label})
        ON CONFLICT (operator_id, legend_item_type) DO UPDATE
          SET localization_key = ${r.localizationKey}, label = ${label}
      `;
      totalInserted++;
    }
    console.log(`  ${results.length} types: ${results.map((r) => `${r.legendItemType}=${r.localizationKey}`).join(", ")}`);
  }

  console.log(`\nDone. ${totalInserted} legend type labels stored.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
