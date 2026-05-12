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
import { OPERATORS } from "../lib/ingest/operator-registry";

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
