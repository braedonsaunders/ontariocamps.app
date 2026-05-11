/**
 * Static data source.
 *
 * Loads operators / parks / sites / camp_maps / equipment options into in-memory
 * Maps at server start. This is fine because these tables change at most weekly
 * (driven by `npm run ingest:metadata`), and the total row count is small
 * (~25k rows, mostly sites).
 *
 * **Per-night availability is not loaded here.** That lives in `site_availability`
 * and is queried on demand via `lib/db/queries.ts` so a fast `ingest:availability`
 * refresh is visible immediately without restarting the dev server.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dbHasData } from "./db/client";
import {
  getAllOperators,
  getAllParks,
  getAllCampgrounds,
  getAllCampMaps,
  getAllSites,
  getAllEquipmentOptions,
  getRefreshMeta,
  getLatestRefreshLogPerType,
  type RefreshLogRow,
} from "./db/queries";
import type { Operator, Park, Campground, Site, CampMap, EquipmentOption } from "./types";
import {
  operators as mockOperators,
  parks as mockParks,
  campgrounds as mockCampgrounds,
  sites as mockSites,
} from "./mock-data";

const hasReal = dbHasData();

export const dataSource: "real" | "mock" = hasReal ? "real" : "mock";

const refreshMeta = hasReal ? getRefreshMeta() : [];
function metaFor(type: "metadata" | "availability"): string | null {
  return refreshMeta.find((m) => m.refresh_type === type)?.last_success_at ?? null;
}
export const metadataLastRefreshedAt: string | null = metaFor("metadata");
export const availabilityLastRefreshedAt: string | null = metaFor("availability");
/** Backwards-compatible alias used by older UI; falls back to whichever
 *  refresh ran most recently. */
export const dataSourceGeneratedAt: string | null =
  availabilityLastRefreshedAt ?? metadataLastRefreshedAt;

export const refreshRuns: RefreshLogRow[] = hasReal ? getLatestRefreshLogPerType() : [];

// Static metadata — loaded once at module eval.
export const operators: Operator[] = hasReal ? getAllOperators() : mockOperators;
export const parks: Park[] = hasReal ? getAllParks() : mockParks;
export const campgrounds: Campground[] = hasReal ? getAllCampgrounds() : mockCampgrounds;
export const sites: Site[] = hasReal ? getAllSites() : mockSites;
export const campMaps: CampMap[] = hasReal ? getAllCampMaps() : [];
export const equipmentOptions: EquipmentOption[] = hasReal ? getAllEquipmentOptions() : [];

// Pre-indexed lookups
export const parkById = new Map(parks.map((p) => [p.id, p]));
export const campgroundById = new Map(campgrounds.map((c) => [c.id, c]));
export const operatorById = new Map(operators.map((o) => [o.id, o]));
export const siteById = new Map(sites.map((s) => [s.id, s]));

export const sitesByCampground = (() => {
  const m = new Map<string, Site[]>();
  for (const s of sites) {
    if (!m.has(s.campground_id)) m.set(s.campground_id, []);
    m.get(s.campground_id)!.push(s);
  }
  return m;
})();

export const campgroundsByPark = (() => {
  const m = new Map<string, Campground[]>();
  for (const c of campgrounds) {
    if (!m.has(c.park_id)) m.set(c.park_id, []);
    m.get(c.park_id)!.push(c);
  }
  return m;
})();

export const campMapsByPark = (() => {
  const m = new Map<string, CampMap[]>();
  for (const cm of campMaps) {
    if (!m.has(cm.park_id)) m.set(cm.park_id, []);
    m.get(cm.park_id)!.push(cm);
  }
  return m;
})();

export const equipmentByOperator = (() => {
  const m = new Map<string, EquipmentOption[]>();
  for (const eq of equipmentOptions) {
    if (!m.has(eq.operator_id)) m.set(eq.operator_id, []);
    m.get(eq.operator_id)!.push(eq);
  }
  return m;
})();

// `refreshMeta` for the data-freshness page
export const ingestRuns = refreshRuns;

// Path used by debug commands etc.
export const dbExists: boolean = existsSync(resolve(process.cwd(), "data", "ontariocamps.db"));
