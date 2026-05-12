/**
 * Per-night availability refresh.
 *
 *   npm run ingest:availability -- --days 30     # hot path / frequent
 *   npm run ingest:availability                  # full 180-day horizon
 *   npm run ingest:availability -- --concurrency 10 --delay 200
 *   npm run ingest:availability -- --operator gtc_lprca
 *   npm run ingest:availability -- --missing-only # only sites without today's row
 *   npm run ingest:availability -- --stale-hours 6 --shard-count 6 --shard-index 0
 *   npm run ingest:availability -- --refresh-analytics # slower MV refresh
 *   npm run ingest:availability -- --max-sites 200   # quick smoke
 *
 * Target cadence: run short windows frequently; run the full horizon on a
 * slower cadence. This script only fetches moving booking availability.
 *
 * Reads vendor IDs from `sites` (populated by `npm run ingest:metadata`) — so
 * you must run metadata first. UPSERTs the result into `site_availability`.
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { refreshAvailability, type AvailabilityRefreshOptions } from "../lib/ingest/availability";

function parseArgs(argv: string[]): AvailabilityRefreshOptions {
  const opts: AvailabilityRefreshOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--concurrency") opts.concurrency = Number(argv[++i]);
    else if (a === "--delay")  opts.requestDelayMs = Number(argv[++i]);
    else if (a === "--days")   opts.daysAhead = Number(argv[++i]);
    else if (a === "--skip")   opts.daysSkip = Number(argv[++i]);
    else if (a === "--max-sites") opts.maxSites = Number(argv[++i]);
    else if (a === "--operator") (opts.operatorIds ??= []).push(argv[++i]);
    else if (a === "--missing-only") opts.missingOnly = true;
    else if (a === "--stale-hours") opts.staleHours = Number(argv[++i]);
    else if (a === "--shard-count") opts.shardCount = Number(argv[++i]);
    else if (a === "--shard-index") opts.shardIndex = Number(argv[++i]);
    else if (a === "--refresh-analytics") opts.refreshAnalytics = true;
  }
  return opts;
}

async function main() {
  mkdirSync(resolve(process.cwd(), "data"), { recursive: true });
  const opts = parseArgs(process.argv.slice(2));
  console.error(`[ingest:availability] starting with ${JSON.stringify(opts)}`);
  const r = await refreshAvailability(opts, (m) => console.error(`  ${m}`));
  if (r.errors.length > 0) {
    console.error(`[ingest:availability] errors:`);
    for (const e of r.errors.slice(0, 8)) console.error(`  ${e}`);
    if (r.errors.length > 8) console.error(`  …and ${r.errors.length - 8} more`);
  }
}

main().catch((err) => {
  console.error("[ingest:availability] fatal:", err);
  process.exit(1);
});
