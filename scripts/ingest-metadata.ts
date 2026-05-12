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
import { OPERATORS } from "../lib/ingest/operator-registry";

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
