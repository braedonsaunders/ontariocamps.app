/**
 * Metadata ingest — static data that rarely changes.
 *
 * Refreshes: operators, parks, campgrounds, camp_maps, sites, site_type_labels,
 *            equipment_categories, operator_fetch_config.
 *
 * Does NOT touch site_availability — availability is a separate, frequent
 * refresh job (see availability.ts).
 *
 * Target cadence: weekly. Target runtime: ~3–5 min for all 8 operators.
 *
 * Every write is an UPSERT, so a partial failure preserves the prior snapshot.
 * A failing operator only affects its own rows; other operators stay valid.
 */

import {
  CamisClient,
  type CamisBookingCategory,
  type CamisEquipmentCategory,
  type CamisMap,
  type CamisMapResource,
  localizedName,
} from "./camis-client";
import { resolveCoordinates } from "./coordinates";
import {
  upsertOperator,
  upsertPark,
  upsertCampground,
  upsertCampMap,
  upsertSite,
  upsertSiteTypeLabel,
  upsertEquipmentOption,
  upsertOperatorFetchConfig,
  startRefreshLog,
  finishRefreshLog,
  setRefreshMeta,
  type SiteWrite,
} from "../db/queries";
import type { Operator, EquipmentOption, SiteType } from "../types";

// ─── Helpers (shared with availability.ts via duplicated logic kept simple) ─

function siteTypeFromLabel(label: string | null | undefined): SiteType {
  if (!label) return "tent";
  const l = label.toLowerCase();
  if (l.includes("yurt")) return "yurt";
  if (l.includes("cabin") || l.includes("cottage") || l.includes("shelter")) return "cabin";
  if (l.includes("backcountry")) return "backcountry";
  if (l.includes("trailer equipped") || l.includes("rv")) return "rv";
  if (l.includes("serviced") || l.includes("electric")) return "rv";
  return "tent";
}

function hasElectricFromLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  if (l.includes("non-electric") || l.includes("unserviced")) return false;
  if (l.includes("serviced") || l.includes("electric") || l.includes("trailer equipped")) return true;
  return false;
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function pickCampsiteBookingCategory(cats: CamisBookingCategory[]): CamisBookingCategory | null {
  const enabled = cats.filter((c) => !c.isDisabled);
  const named = enabled.find((c) => c.localizedValues.some((lv) => /campsite/i.test(lv.name ?? "")));
  if (named) return named;
  const overnight = enabled.find((c) => c.bookingModel === 0);
  return overnight ?? enabled[0] ?? null;
}

function pickTentEquipment(eq: CamisEquipmentCategory[]) {
  for (const cat of eq) {
    const subs = cat.subEquipmentCategories ?? [];
    const tent = subs.find((s) =>
      s.localizedValues.some((lv) => /^tent\b|1\s*tent|small.*tent/i.test(lv.name ?? "")),
    );
    if (tent) return { equipmentCategoryId: cat.equipmentCategoryId, subEquipmentCategoryId: tent.subEquipmentCategoryId };
  }
  const first = eq[0];
  const firstSub = first?.subEquipmentCategories?.[0];
  return {
    equipmentCategoryId: first?.equipmentCategoryId ?? -32768,
    subEquipmentCategoryId: firstSub?.subEquipmentCategoryId ?? -32768,
  };
}

function operatorEquipmentList(
  operator: Operator,
  bookingCategory: CamisBookingCategory | null,
  equipmentCats: CamisEquipmentCategory[],
): EquipmentOption[] {
  if (!bookingCategory) return [];
  const allowed = new Set<string>();
  for (const a of bookingCategory.allowedEquipmentCategories ?? []) {
    allowed.add(`${a.equipmentCategoryId}:${a.subEquipmentCategoryId}`);
  }
  const out: EquipmentOption[] = [];
  for (const cat of equipmentCats) {
    for (const sub of cat.subEquipmentCategories ?? []) {
      if (!allowed.has(`${cat.equipmentCategoryId}:${sub.subEquipmentCategoryId}`)) continue;
      const name = (sub.localizedValues ?? []).find((lv) => lv.cultureName === "en-CA")?.name
        ?? sub.localizedValues?.[0]?.name
        ?? `${sub.subEquipmentCategoryId}`;
      out.push({
        operator_id: operator.id,
        equipment_category_id: cat.equipmentCategoryId,
        sub_equipment_category_id: sub.subEquipmentCategoryId,
        name,
        order_index: sub.order ?? 0,
      });
    }
  }
  return out.sort((a, b) => a.order_index - b.order_index);
}

function extractParkCandidates(rootMaps: CamisMap[]) {
  const byRl = new Map<number, { resourceLocationId: number; childMapId: number | null; title: string }>();
  for (const m of rootMaps) {
    for (const ml of m.mapLinks ?? []) {
      const rl = ml.resourceLocationId;
      if (rl == null) continue;
      if (rl === -2147483648 && ml.childMapId === -2147483648) continue;
      const title = localizedName(ml.localizations) ?? `RL ${rl}`;
      if (!byRl.has(rl)) byRl.set(rl, { resourceLocationId: rl, childMapId: ml.childMapId, title });
    }
  }
  return Array.from(byRl.values());
}

type LeafMap = {
  mapId: number; name: string | null; imageUrl: string;
  xDimension: number; yDimension: number; resources: CamisMapResource[];
};

function collectLeafMapsFrom(maps: CamisMap[]): LeafMap[] {
  const seen = new Set<string>();
  const leaves: LeafMap[] = [];
  for (const m of maps) {
    const resources = m.mapResources ?? [];
    if (resources.length === 0) continue;
    if (m.mapType === 3 && resources.length <= 1) continue;
    const imageUrl = m.mapImageUrls?.["en-CA"];
    if (!imageUrl) continue;
    const filtered: CamisMapResource[] = [];
    for (const r of resources) {
      const key = String(r.resourceId);
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push(r);
    }
    if (filtered.length === 0) continue;
    leaves.push({
      mapId: m.mapId,
      name: m.localizedValues?.[0]?.name ?? null,
      imageUrl,
      xDimension: typeof m.xDimension === "number" ? m.xDimension : 800,
      yDimension: typeof m.yDimension === "number" ? m.yDimension : 600,
      resources: filtered,
    });
  }
  return leaves;
}

// ─── Per-operator metadata refresh ───────────────────────────────────────

export async function refreshOperatorMetadata(
  operator: Operator,
  log: (m: string) => void = () => {},
): Promise<{ status: "success" | "partial" | "failed"; parks_seen: number; sites_seen: number; errors: string[] }> {
  const started = Date.now();
  const errors: string[] = [];
  let parks_seen = 0;
  let sites_seen = 0;

  const runId = await startRefreshLog("metadata", operator.id);
  await upsertOperator(operator);

  const client = new CamisClient({ baseUrl: operator.base_url, requestDelayMs: 500 });

  let rootMaps: CamisMap[];
  let bookingCats: CamisBookingCategory[];
  let equipmentCats: CamisEquipmentCategory[];
  try {
    [rootMaps, bookingCats, equipmentCats] = await Promise.all([
      client.getRootMaps(),
      client.getBookingCategories(),
      client.getEquipmentCategories(),
    ]);
  } catch (err) {
    errors.push(`bootstrap: ${(err as Error).message}`);
    await finishRefreshLog({
      id: runId, status: "failed", duration_ms: Date.now() - started, errors,
    });
    return { status: "failed", parks_seen, sites_seen, errors };
  }

  const bookingCategoryRecord = pickCampsiteBookingCategory(bookingCats);
  const bookingCategoryId = bookingCategoryRecord?.bookingCategoryId ?? 0;
  const { equipmentCategoryId, subEquipmentCategoryId } = pickTentEquipment(equipmentCats);

  // Per-operator fetch config — used by the availability ingest to know which
  // booking category + equipment to query.
  await upsertOperatorFetchConfig({
    operator_id: operator.id,
    campsite_booking_category_id: bookingCategoryId,
    equipment_category_id: equipmentCategoryId,
    sub_equipment_category_id: subEquipmentCategoryId,
  });

  // iconType → label dictionary
  try {
    const icons = await client.getIconLabels();
    for (const i of icons) {
      const name = i.localizedValues.find((lv) => lv.cultureName === "en-CA")?.name ?? i.localizedValues[0]?.name;
      if (name) await upsertSiteTypeLabel(operator.id, i.mapIconType, name);
    }
  } catch (err) {
    errors.push(`iconLabels: ${(err as Error).message}`);
  }

  for (const opt of operatorEquipmentList(operator, bookingCategoryRecord, equipmentCats)) {
    await upsertEquipmentOption(opt);
  }

  // Per-operator iconType → label lookup for site_type_label
  const labelByIcon = new Map<number, string>();
  for (const i of (await client.getIconLabels().catch(() => []))) {
    const name = i.localizedValues.find((lv) => lv.cultureName === "en-CA")?.name ?? i.localizedValues[0]?.name;
    if (name) labelByIcon.set(i.mapIconType, name);
  }

  const candidates = extractParkCandidates(rootMaps);
  const matched = candidates.filter((c) => resolveCoordinates(c.title));
  log(`[${operator.id}] ${matched.length}/${candidates.length} parks with curated coords`);

  for (let i = 0; i < matched.length; i++) {
    const cand = matched[i];
    parks_seen += 1;
    const coord = resolveCoordinates(cand.title)!;
    const parkId = `p_${operator.id}_${cand.resourceLocationId}`;

    await upsertPark({
      id: parkId,
      operator_id: operator.id,
      vendor_park_id: String(cand.resourceLocationId),
      slug: slugify(`${cand.title}-${cand.resourceLocationId}`),
      name: cand.title,
      description: coord.description ?? `${cand.title} — ${operator.name}.`,
      region: coord.region,
      location: { lat: coord.lat, lng: coord.lng },
      address: "",
      hero_image_url: coord.heroImageUrl,
      vendor_url: `${operator.base_url}/create-booking/search-results?resourceLocationId=${cand.resourceLocationId}${cand.childMapId != null ? `&mapId=${cand.childMapId}` : ""}&bookingCategoryId=${bookingCategoryId}`,
    });

    const cgId = `cg_${parkId}`;
    await upsertCampground({ id: cgId, park_id: parkId, vendor_map_id: String(cand.childMapId ?? ""), name: "Main campground" });

    let parkMaps: CamisMap[];
    try {
      parkMaps = await client.getMaps(cand.resourceLocationId);
    } catch (err) {
      errors.push(`getMaps(${cand.title}): ${(err as Error).message}`);
      continue;
    }

    const leafMaps = collectLeafMapsFrom(parkMaps);
    if (leafMaps.length === 0) continue;

    for (const leaf of leafMaps) {
      const campMapId = `cm_${parkId}_${leaf.mapId}`;
      await upsertCampMap({
        id: campMapId, park_id: parkId, campground_id: cgId,
        vendor_map_id: String(leaf.mapId), name: leaf.name, image_url: leaf.imageUrl,
        x_dimension: leaf.xDimension, y_dimension: leaf.yDimension,
      });
      for (const r of leaf.resources) {
        const siteId = `s_${parkId}_${r.resourceId}`;
        const label = labelByIcon.get(r.iconType) ?? null;
        const site: SiteWrite = {
          id: siteId,
          campground_id: cgId,
          vendor_site_id: String(r.resourceId),
          name: String(Math.abs(r.resourceId) % 10000),
          site_type: siteTypeFromLabel(label),
          site_type_label: label,
          icon_type: r.iconType,
          max_party_size: 6,
          max_equipment_length_ft: null,
          has_electric: hasElectricFromLabel(label),
          has_water: false,
          has_sewer: false,
          is_pull_through: false,
          is_accessible: false,
          is_pet_friendly: true,
          is_waterfront: false,
          amenities: ["fire_pit", "picnic_table"],
          camp_map_id: campMapId,
          map_x: r.xCoordinate,
          map_y: r.yCoordinate,
          vendor_resource_location_id: cand.resourceLocationId,
          vendor_resource_id: r.resourceId,
          vendor_booking_category_id: bookingCategoryId,
        };
        await upsertSite(site);
        sites_seen += 1;
      }
    }

    if (i % 10 === 9 || i === matched.length - 1) {
      log(`[${operator.id}] ${i + 1}/${matched.length} parks (sites=${sites_seen})`);
    }
  }

  const status: "success" | "partial" = errors.length === 0 ? "success" : "partial";
  await finishRefreshLog({
    id: runId, status, parks_seen, sites_seen,
    duration_ms: Date.now() - started, errors,
  });

  return { status, parks_seen, sites_seen, errors };
}

export async function refreshAllMetadata(operators: Operator[], log: (m: string) => void = () => {}): Promise<void> {
  for (const op of operators) {
    log(`==> ${op.id} (${op.name})`);
    const result = await refreshOperatorMetadata(op, log);
    log(`[${op.id}] ${result.status}: ${result.parks_seen} parks, ${result.sites_seen} sites, ${result.errors.length} errors`);
  }
  await setRefreshMeta("metadata");
}
