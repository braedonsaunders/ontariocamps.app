/**
 * Replace each Ontario Parks park's hero image URL with the high-res
 * marketing-site version. The CAMIS resourceLocation `photos[]` only ships
 * a ~268-px-wide thumbnail; the ontarioparks.ca marketing pages embed a
 * 1200-px-wide `op-main-image` we can use instead.
 *
 * Run: npx tsx scripts/backfill-op-hero-images.ts
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
const BASE = "https://www.ontarioparks.ca";

/** Generate slug candidates in the formats ontarioparks.ca uses. The marketing
 *  site sometimes hyphenates ("six-mile-lake"), sometimes runs together
 *  ("bonecho", "balsamlake"). Returns both shapes so we can try each. */
function parkSlugs(name: string): string[] {
  const cleaned = name
    .replace(/Provincial Park.*$/i, "")
    .replace(/\s*[-–—]\s*.*$/, "")
    .replace(/\(.*?\)/g, "")
    .trim();
  if (!cleaned) return [];
  const norm = cleaned
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();
  const hyphen = norm.replace(/\s+/g, "-");
  const joined = norm.replace(/\s+/g, "");
  return Array.from(new Set([joined, hyphen]));
}

async function fetchHero(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/park/${slug}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
        "Accept-Language": "en-CA,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // The marketing template uses class="op-main-image" for the hero. There
    // may be a srcset; we pluck the primary src first, then fall back to a
    // generated -1200 variant if present.
    const m = html.match(/<img[^>]+class="[^"]*op-main-image[^"]*"[^>]+src="([^"]+)"/);
    if (!m) return null;
    const src = m[1];
    return src.startsWith("http") ? src : `${BASE}${src}`;
  } catch {
    return null;
  }
}

async function main() {
  const parks = await sql<Array<{ id: string; slug: string; name: string }>>`
    SELECT id, slug, name FROM parks WHERE operator_id = 'ontario_parks' ORDER BY name
  `;
  console.log(`Walking ${parks.length} Ontario Parks parks…`);

  let updated = 0;
  let skipped = 0;
  let polite = 0;
  for (let i = 0; i < parks.length; i++) {
    const p = parks[i];
    const candidates = parkSlugs(p.name);
    if (candidates.length === 0) { skipped++; continue; }

    polite++;
    if (polite % 5 === 0) await new Promise((r) => setTimeout(r, 250));

    let hero: string | null = null;
    for (const slug of candidates) {
      hero = await fetchHero(slug);
      if (hero) break;
    }
    if (!hero) {
      skipped++;
      continue;
    }
    await sql`UPDATE parks SET hero_image_url = ${hero} WHERE id = ${p.id} AND (hero_image_url IS NULL OR hero_image_url ILIKE '%ontarioparks.ca%')`;
    updated += 1;

    if (i % 20 === 19 || i === parks.length - 1) {
      console.log(`  ${i + 1}/${parks.length} · updated ${updated}, skipped ${skipped}`);
    }
  }
  console.log(`\nDone. Updated ${updated}, skipped ${skipped}.`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
