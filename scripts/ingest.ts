/**
 * Cold-start ingest — runs metadata + availability back to back.
 *
 *   npm run ingest                # full cold start
 *   npm run ingest -- --metadata  # metadata only (alias for ingest:metadata)
 *   npm run ingest -- --avail     # availability only (alias for ingest:availability)
 *
 * For day-to-day refresh, prefer the dedicated scripts:
 *   npm run ingest:metadata                    (weekly/on-demand static data)
 *   npm run ingest:availability -- --days 30   (frequent moving data)
 *   npm run ingest:availability                (slower full-horizon sweep)
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { refreshAllMetadata } from "../lib/ingest/metadata";
import { refreshAvailability } from "../lib/ingest/availability";
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
  gtc("lprca",   "Long Point Region CA",  "longpoint.goingtocamp.com"),
  gtc("stclair", "St. Clair Region CA",   "stclair.goingtocamp.com"),
  gtc("otonabee","Otonabee Region CA",    "otonabee.goingtocamp.com"),
  gtc("npca",    "Niagara Peninsula CA",  "niagara.goingtocamp.com"),
  gtc("trca",    "Toronto and Region CA", "camping.trca.ca"),
  gtc("grca",    "Grand River CA",        "www.grcacamping.ca"),
  gtc("upperthames",  "Upper Thames River CA",  "upperthames.goingtocamp.com"),
  gtc("maitland",     "Maitland Valley CA",     "maitlandvalley.goingtocamp.com"),
  gtc("catfish",      "Catfish Creek CA",       "catfishcreek.goingtocamp.com"),
  gtc("hca",          "Hamilton Conservation Authority", "hcareservations.ca"),
];

async function main() {
  mkdirSync(resolve(process.cwd(), "data"), { recursive: true });
  const args = new Set(process.argv.slice(2));
  const doMeta  = !args.has("--avail");
  const doAvail = !args.has("--metadata");
  const t0 = Date.now();
  if (doMeta) {
    console.error("[ingest] phase 1: metadata");
    await refreshAllMetadata(OPERATORS, (m) => console.error(`  ${m}`));
  }
  if (doAvail) {
    console.error("[ingest] phase 2: availability");
    await refreshAvailability({}, (m) => console.error(`  ${m}`));
  }
  console.error(`[ingest] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("[ingest] fatal:", err);
  process.exit(1);
});
