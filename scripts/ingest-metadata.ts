/**
 * Static metadata refresh.
 *
 *   npm run ingest:metadata
 *
 * Target cadence: weekly. Runtime: ~3–5 min.
 *
 * Refreshes operators, parks, sites, camp_maps, icon labels, equipment options.
 * Does NOT touch site_availability — that's `npm run ingest:availability`.
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { refreshAllMetadata } from "../lib/ingest/metadata";
import type { Operator } from "../lib/types";

const ONTARIO_PARKS: Operator = {
  id: "ontario_parks", name: "Ontario Parks", vendor: "camis5",
  base_url: "https://reservations.ontarioparks.ca",
  booking_url: "https://reservations.ontarioparks.ca/create-booking/search-results",
  active: true,
};
const PARKS_CANADA: Operator = {
  id: "parks_canada", name: "Parks Canada", vendor: "pcrs",
  base_url: "https://reservation.pc.gc.ca",
  booking_url: "https://reservation.pc.gc.ca/create-booking/search-results",
  active: true,
};
function gtc(id: string, name: string, host: string): Operator {
  return {
    id: `gtc_${id}`, name, vendor: "goingtocamp",
    base_url: `https://${host}`,
    booking_url: `https://${host}/create-booking/search-results`,
    active: true,
  };
}

const OPERATORS: Operator[] = [
  ONTARIO_PARKS,
  PARKS_CANADA,
  gtc("lprca",        "Long Point Region CA",   "longpoint.goingtocamp.com"),
  gtc("stclair",      "St. Clair Region CA",    "stclair.goingtocamp.com"),
  gtc("otonabee",     "Otonabee Region CA",     "otonabee.goingtocamp.com"),
  gtc("npca",         "Niagara Peninsula CA",   "niagara.goingtocamp.com"),
  gtc("trca",         "Toronto and Region CA",  "camping.trca.ca"),
  gtc("grca",         "Grand River CA",         "www.grcacamping.ca"),
  gtc("upperthames",  "Upper Thames River CA",  "upperthames.goingtocamp.com"),
  gtc("maitland",     "Maitland Valley CA",     "maitlandvalley.goingtocamp.com"),
  gtc("catfish",      "Catfish Creek CA",       "catfishcreek.goingtocamp.com"),
];

async function main() {
  mkdirSync(resolve(process.cwd(), "data"), { recursive: true });
  // Optional --operator <id> (repeatable) to scope a run to specific operators.
  const wanted: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--operator") wanted.push(argv[++i]);
  }
  const ops = wanted.length
    ? OPERATORS.filter((o) => wanted.includes(o.id))
    : OPERATORS;
  if (wanted.length && ops.length !== wanted.length) {
    const missing = wanted.filter((w) => !ops.find((o) => o.id === w));
    console.error(`[ingest:metadata] unknown operator(s): ${missing.join(", ")}`);
    process.exit(1);
  }
  const start = Date.now();
  console.error(`[ingest:metadata] starting ${ops.length} operator(s)…`);
  await refreshAllMetadata(ops, (m) => console.error(`  ${m}`));
  console.error(`[ingest:metadata] done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("[ingest:metadata] fatal:", err);
  process.exit(1);
});
