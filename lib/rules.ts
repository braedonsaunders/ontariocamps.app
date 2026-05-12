import type {
  DecodedSiteAttribute,
  Operator,
  OperatorRuleSource,
  RuleHighlight,
  RuleItem,
  SiteRuleSummary,
  SourceEquipmentRule,
} from "@/lib/types";
import type {
  CamisAttributeDefinition,
  CamisDefinedAttribute,
  CamisEquipmentCategory,
  CamisResourceDetail,
} from "@/lib/ingest/camis-client";

type AttributeDefinitionMap = Record<string, CamisAttributeDefinition>;

function english(values?: Array<{ cultureName: string; displayName?: string; name?: string }>): string | null {
  if (!values || values.length === 0) return null;
  const en = values.find((v) => v.cultureName === "en-CA") ?? values[0];
  return (en.displayName ?? en.name ?? "").trim() || null;
}

function yesNo(value: string | null): boolean | null {
  if (!value) return null;
  if (/^yes$/i.test(value)) return true;
  if (/^no$/i.test(value)) return false;
  return null;
}

function num(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function valueLabels(def: CamisAttributeDefinition | undefined, values: number[] | undefined): string[] {
  if (!def || !Array.isArray(values)) return [];
  return values
    .map((v) => {
      const match = def.values?.find((candidate) => candidate.enumValue === v);
      return english(match?.localizedValues) ?? String(v);
    })
    .filter(Boolean);
}

export function decodeSiteAttributes(
  attrs: CamisDefinedAttribute[] | undefined,
  definitions: AttributeDefinitionMap,
): DecodedSiteAttribute[] {
  if (!attrs?.length) return [];
  return attrs
    .map((attr) => {
      const def = definitions[String(attr.attributeDefinitionId)];
      const label = english(def?.localizedValues) ?? `Attribute ${attr.attributeDefinitionId}`;
      const rawValues = Array.isArray(attr.values) ? attr.values : [];
      return {
        attributeDefinitionId: attr.attributeDefinitionId,
        attributeId: attr.attributeId ?? null,
        label,
        value: attr.value ?? null,
        values: valueLabels(def, rawValues),
        rawValues,
        isFilterable: Boolean(def?.isFilterable),
        order: def?.order ?? 9999,
      };
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

function first(decoded: DecodedSiteAttribute[], label: string): DecodedSiteAttribute | undefined {
  return decoded.find((a) => a.label.toLowerCase() === label.toLowerCase());
}

function firstValue(decoded: DecodedSiteAttribute[], label: string): string | null {
  const attr = first(decoded, label);
  return attr?.values[0] ?? (attr?.value == null ? null : String(attr.value));
}

function values(decoded: DecodedSiteAttribute[], label: string): string[] {
  return first(decoded, label)?.values ?? [];
}

function firstNumber(decoded: DecodedSiteAttribute[], label: string): number | null {
  return num(first(decoded, label)?.value);
}

function has(valuesToSearch: string[], expected: string): boolean {
  return valuesToSearch.some((v) => v.toLowerCase() === expected.toLowerCase());
}

function maybePush(highlights: RuleHighlight[], item: RuleHighlight | null | undefined) {
  if (!item || highlights.some((h) => h.label === item.label)) return;
  highlights.push(item);
}

export function decodeResourceRules(args: {
  vendor: Operator["vendor"];
  detail: CamisResourceDetail | undefined;
  definitions: AttributeDefinitionMap;
  collectedAt?: string | null;
}): SiteRuleSummary {
  const decoded = decodeSiteAttributes(args.detail?.definedAttributes, args.definitions);
  const restrictions = values(decoded, "Restrictions");
  const conditions = values(decoded, "Conditions");
  const groundCover = values(decoded, "Ground Cover");
  const obstructions = values(decoded, "Obstructions");
  const nearby = values(decoded, "Adjacent To");

  const serviceType = firstValue(decoded, "Service Type");
  const electricalService = firstValue(decoded, "Electrical Service");
  const shade = firstValue(decoded, "Site Shade");
  const privacy = firstValue(decoded, "Privacy");
  const quality = firstValue(decoded, "Quality");
  const pullThrough = yesNo(firstValue(decoded, "Pull-through"));
  const doubleSite = yesNo(firstValue(decoded, "Double Site"));
  const barrierFree = yesNo(firstValue(decoded, "Barrier Free"));
  const firePitAvailable = yesNo(firstValue(decoded, "Fire Pit Available"));
  const picnicTable = yesNo(firstValue(decoded, "Picnic Table"));
  const dogsAllowedRaw = yesNo(firstValue(decoded, "Dogs Allowed"));
  const alcoholPermitted = yesNo(firstValue(decoded, "Alcohol Permitted"));

  const policies = {
    radioFree: has(restrictions, "Radio Free"),
    generatorFree: has(restrictions, "Generator Free"),
    noPets: has(restrictions, "No Pets"),
    dogsAllowed: has(restrictions, "No Pets") ? false : dogsAllowedRaw,
    tentsOnly: has(restrictions, "Tents Only"),
    noTents: has(restrictions, "No Tents"),
    noVehicles: has(restrictions, "No Vehicles"),
    walkIn: has(restrictions, "Walk In") || has(restrictions, "Ski In"),
    alcoholPermitted,
  };

  const setup = {
    serviceType,
    electricalService,
    pullThrough,
    doubleSite,
    barrierFree,
    firePitAvailable,
    maxTents: firstNumber(decoded, "Maximum Tents"),
    maxTrailers: firstNumber(decoded, "Maximum Trailers"),
    siteLengthM: firstNumber(decoded, "Site Length (m)"),
    siteWidthM: firstNumber(decoded, "Site Width (m)"),
    outletDistanceM: firstNumber(decoded, "Outlet Distance (m)"),
  };

  const character = {
    shade,
    privacy,
    quality,
    conditions,
    groundCover,
    padSlope: firstValue(decoded, "Pad Slope"),
    obstructions,
    firePitLocation: firstValue(decoded, "Fire Pit Location"),
    firePit: firstValue(decoded, "Fire Pit"),
  };

  const comfort = {
    showers: firstValue(decoded, "Showers") ?? firstValue(decoded, "Shower Type"),
    toilet: firstValue(decoded, "Toilet"),
    toiletType: firstValue(decoded, "Toilet Type"),
    toiletDistanceM: firstNumber(decoded, "Toilet Distance (m)"),
    waterTap: firstValue(decoded, "Water Tap"),
    waterTapDistanceM: firstNumber(decoded, "Water Tap Distance (m)"),
    showerDistanceM: firstNumber(decoded, "Shower Distance (m)"),
    picnicTable,
  };

  const highlights: RuleHighlight[] = [];
  maybePush(highlights, policies.radioFree ? { label: "Radio-free", tone: "emerald", category: "policy" } : null);
  maybePush(highlights, policies.generatorFree ? { label: "Generator-free", tone: "emerald", category: "policy" } : null);
  maybePush(highlights, policies.walkIn ? { label: "Walk-in", tone: "lake", category: "restriction" } : null);
  maybePush(highlights, policies.noVehicles ? { label: "No vehicles", tone: "amber", category: "restriction" } : null);
  maybePush(highlights, policies.noPets ? { label: "No pets", tone: "red", category: "restriction" } : null);
  maybePush(highlights, policies.tentsOnly ? { label: "Tents only", tone: "lake", category: "restriction" } : null);
  maybePush(highlights, setup.pullThrough ? { label: "Pull-through", tone: "stone", category: "setup" } : null);
  maybePush(highlights, setup.electricalService ? { label: setup.electricalService, tone: "amber", category: "setup" } : null);
  maybePush(highlights, privacy === "Good" ? { label: "Good privacy", tone: "emerald", category: "character" } : null);
  maybePush(highlights, shade ? { label: shade, tone: shade.includes("Full") ? "emerald" : "stone", category: "character" } : null);
  maybePush(highlights, nearby.includes("Beach") ? { label: "Near beach", tone: "lake", category: "nearby" } : null);
  maybePush(highlights, nearby.includes("Body of Water") ? { label: "Near water", tone: "lake", category: "nearby" } : null);
  maybePush(highlights, conditions.includes("Noisy") ? { label: "Noisy", tone: "red", category: "character" } : null);
  maybePush(highlights, conditions.includes("Poor Drainage") ? { label: "Poor drainage", tone: "amber", category: "character" } : null);

  return {
    highlights: highlights.slice(0, 8),
    restrictions,
    setup,
    character,
    nearby,
    comfort,
    policies,
    source: { vendor: args.vendor, collectedAt: args.collectedAt ?? null },
  };
}

export function equipmentRules(
  allowed: CamisResourceDetail["allowedEquipment"],
  equipmentCats: CamisEquipmentCategory[],
): SourceEquipmentRule[] {
  return (allowed ?? []).map((entry) => {
    const cat = equipmentCats.find((c) => c.equipmentCategoryId === entry.equipmentCategoryId);
    const sub = cat?.subEquipmentCategories?.find(
      (s) => s.subEquipmentCategoryId === entry.subEquipmentCategoryId,
    );
    return {
      equipmentCategoryId: entry.equipmentCategoryId,
      subEquipmentCategoryId: entry.subEquipmentCategoryId,
      label: english(sub?.localizedValues) ?? null,
    };
  });
}

const ONTARIO_PARKS_RULES: RuleItem[] = [
  { label: "Booking window", value: "Up to 5 months before arrival at 7:00 a.m. ET" },
  { label: "Check-in / check-out", value: "After 2:00 p.m. / before 2:00 p.m." },
  { label: "Occupancy", value: "Up to 6 people per campsite unless a single family exceeds that count" },
  { label: "Vehicles", value: "1 vehicle included; extra vehicles need permits and may park separately" },
  { label: "Shelter equipment", value: "Up to 3 shelter pieces plus 1 dining shelter and a tarp where space permits" },
  { label: "Same-name reservations", value: "Multiple reservations in the same name for the same time period are not allowed" },
  { label: "Maximum stay", value: "Usually 23 nights; select high-demand parks have 7 or 14 night summer limits" },
  { label: "Smoking / vaping", value: "Restricted in enclosed places, sheltered areas, playgrounds, beaches, and sport areas" },
];

const PARKS_CANADA_RULES: RuleItem[] = [
  { label: "Permits", value: "Camping is allowed only in designated areas with a valid camping permit and park entry pass" },
  { label: "Quiet hours", value: "Respect posted quiet hours; excessive noise is prohibited at any time" },
  { label: "Pets", value: "Pets must be leashed at all times" },
  { label: "Clean site", value: "Keep food and attractants secured and maintain a bare campsite" },
  { label: "Neighbour access", value: "Use roads and paths instead of cutting through neighbouring campsites" },
  { label: "Backcountry", value: "Pack out garbage and follow area-specific food storage and permit rules" },
];

const GRAND_RIVER_RULES: RuleItem[] = [
  { label: "Quiet hours", value: "11:00 p.m. to 7:00 a.m." },
  { label: "Occupancy", value: "Maximum 6 overnight occupants per campsite" },
  { label: "Vehicles", value: "1 vehicle included; extra overnight vehicles need permits and may use overflow parking" },
  { label: "Generators", value: "Power generators are prohibited", tone: "red" },
  { label: "Dogs", value: "Leashed at all times, no longer than 2 metres; not allowed in designated swimming areas" },
  { label: "Alcohol / cannabis", value: "Bans may apply by location and date; otherwise alcohol is campsite-only" },
];

const LPRCA_RULES: RuleItem[] = [
  { label: "Quiet hours", value: "11:00 p.m. to 8:00 a.m." },
  { label: "Visitors", value: "Visitors must leave by 10:00 p.m." },
  { label: "Occupancy", value: "Campsites, including visitors, must not exceed 6 overnight occupants" },
  { label: "Vehicles", value: "1 vehicle included; extra vehicles require a pass and may park separately" },
  { label: "Generators", value: "Not allowed without supervisor permission for medical or exceptional reasons", tone: "red" },
  { label: "Alcohol / cannabis", value: "Permitted only on registered campsites unless a ban is in effect" },
];

const TRCA_RULES: RuleItem[] = [
  { label: "Check-in / check-out", value: "Check-in between 2:00 p.m. and 9:00 p.m.; check-out at 12:01 p.m." },
  { label: "Occupancy", value: "Camping fee covers 2 adults and 4 children; maximum 6 people" },
  { label: "Equipment", value: "Usually 2 tents or 1 RV/trailer/motorhome per campsite" },
  { label: "Quiet hours", value: "11:00 p.m. to 7:00 a.m." },
  { label: "Generators", value: "Generators and similar power equipment are not permitted", tone: "red" },
  { label: "Pets", value: "Up to 3 pets per person/family; leashed and never left unattended" },
  { label: "Minimum stays", value: "Weekend and long-weekend minimums apply on listed dates" },
];

const DEFAULT_CA_RULES: RuleItem[] = [
  { label: "Occupancy", value: "Most Ontario conservation authority campsites cap overnight occupancy at 6 people" },
  { label: "Quiet hours", value: "Usually late evening through morning; verify the operator policy before arrival" },
  { label: "Vehicles", value: "Most reservations include 1 vehicle and charge for extras" },
  { label: "Pets", value: "Leash requirements and beach/pool exclusions are common" },
  { label: "Fires", value: "Use designated fire pits and check current fire bans before arrival" },
];

function profile(operator: Operator, rules: RuleItem[], sourceLabel: string, sourceUrl: string, alertsUrl: string | null): OperatorRuleSource {
  return {
    operator_id: operator.id,
    source_label: sourceLabel,
    source_url: sourceUrl,
    alerts_url: alertsUrl,
    rules,
  };
}

export function operatorRuleProfile(operator: Operator): OperatorRuleSource {
  if (operator.id === "ontario_parks") {
    return profile(
      operator,
      ONTARIO_PARKS_RULES,
      "Ontario Parks Rules and Regulations",
      "https://www.ontarioparks.ca/reservations/rules",
      "https://www.ontarioparks.ca/alerts",
    );
  }
  if (operator.id === "parks_canada") {
    return profile(
      operator,
      PARKS_CANADA_RULES,
      "Parks Canada Camping 101",
      "https://parks.canada.ca/voyage-travel/hebergement-accommodation/camping-101",
      "https://parks.canada.ca/voyage-travel/securite-safety/bulletins",
    );
  }
  if (operator.id === "gtc_grca" || operator.id === "gtc_grand") {
    return profile(
      operator,
      GRAND_RIVER_RULES,
      "Grand River Conservation Authority Regulations and Guidelines",
      "https://www.grandriver.ca/outdoor-recreation/conservation-areas/conservation-area-services-info-fees-and-more/regulations-and-guidelines/",
      "https://www.grandriver.ca/outdoor-recreation/conservation-areas/conservation-area-activity-status/",
    );
  }
  if (operator.id === "gtc_lprca") {
    return profile(
      operator,
      LPRCA_RULES,
      "Long Point Region Conservation Authority Camping",
      "https://www.lprca.on.ca/outdoor-recreation/camping/",
      "https://www.lprca.on.ca/outdoor-recreation/conservation-areas/",
    );
  }
  if (operator.id === "gtc_trca") {
    return profile(
      operator,
      TRCA_RULES,
      "TRCA Camping Reservation Policy",
      "https://trca.ca/parks-recreation/camping-reservation-policy/",
      "https://trca.ca/parks-recreation/park-faqs/",
    );
  }
  return profile(
    operator,
    DEFAULT_CA_RULES,
    `${operator.name} camping policies`,
    operator.base_url,
    operator.base_url,
  );
}
