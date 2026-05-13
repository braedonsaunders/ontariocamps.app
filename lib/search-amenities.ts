type RuleRecord = Record<string, unknown>;

export type AmenityDerivationInput = {
  site_name?: string | null;
  site_type?: string | null;
  site_type_label?: string | null;
  site_description?: string | null;
  camp_map_description?: string | null;
  map_feature_labels?: string[] | null;
  amenities?: string[] | null;
  rule_summary?: unknown;
  has_electric?: boolean | null;
  has_water?: boolean | null;
  has_sewer?: boolean | null;
  is_pull_through?: boolean | null;
  is_accessible?: boolean | null;
  is_pet_friendly?: boolean | null;
  is_waterfront?: boolean | null;
};

function asRecord(raw: unknown): RuleRecord {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as RuleRecord) : {};
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
}

function hasTruthyString(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim().length > 0 && !/^(?:no|none|n\/a|null)$/i.test(raw.trim());
}

function stringValue(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

function hasAmp(text: string, amp: 15 | 30 | 50): boolean {
  return new RegExp(`\\b${amp}\\b`, "i").test(text) && /\b(?:a|amp|amps|hydro|electric)/i.test(text);
}

function hasAny(values: string[], pattern: RegExp): boolean {
  return values.some((value) => pattern.test(value));
}

export function deriveAmenityCodes(input: AmenityDerivationInput): string[] {
  const rawAmenities = Array.isArray(input.amenities) ? input.amenities.filter(Boolean) : [];
  const rule = asRecord(input.rule_summary);
  const setup = asRecord(rule.setup);
  const policies = asRecord(rule.policies);
  const comfort = asRecord(rule.comfort);
  const nearby = asStringArray(rule.nearby);
  const highlights = asStringArray(
    Array.isArray(rule.highlights)
      ? rule.highlights.map((item) => (asRecord(item).label))
      : [],
  );
  const textParts = [
    input.site_name,
    input.site_type,
    input.site_type_label,
    input.site_description,
    input.camp_map_description,
    ...rawAmenities,
    ...(input.map_feature_labels ?? []),
    ...nearby,
    ...highlights,
    stringValue(setup.electricalService),
    stringValue(setup.serviceType),
    stringValue(comfort.toilet),
    stringValue(comfort.toiletType),
    stringValue(comfort.showers),
    stringValue(comfort.waterTap),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const text = textParts.join(" ");
  const out = new Set<string>();

  const electricText = !/\b(?:unserviced|non[-\s]?electric)\b/i.test(text) && /\b(?:serviced|electric|hydro)\b/i.test(text);
  const hasElectric = Boolean(input.has_electric) || electricText;
  if (hasElectric) {
    if (hasAmp(text, 15)) out.add("electric_15a");
    if (hasAmp(text, 30)) out.add("electric_30a");
    if (hasAmp(text, 50)) out.add("electric_50a");
    if (!out.has("electric_15a") && !out.has("electric_30a") && !out.has("electric_50a")) out.add("electric_30a");
  }

  if (input.has_water || /\bwater(?:\s+hook[-\s]?up|\s+hookup)\b/i.test(text)) out.add("water");
  if (input.has_sewer || /\bsewer\b/i.test(text)) out.add("sewer");
  if (input.is_pull_through || setup.pullThrough === true || /\bpull[-\s]?through\b/i.test(text)) out.add("pull_through");
  if (input.is_accessible || setup.barrierFree === true || /\b(accessible|barrier[-\s]?free)\b/i.test(text)) out.add("accessible");

  const noPets = policies.noPets === true || policies.dogsAllowed === false || /\b(no pets|pet[-\s]?free|no dogs)\b/i.test(text);
  const dogFriendly =
    (input.is_pet_friendly || policies.dogsAllowed === true || /\b(dog beach|dog run|dogs allowed|dogs on leash|pet[-\s]?friendly|pet area)\b/i.test(text)) &&
    !noPets;
  if (dogFriendly) {
    out.add("dog_friendly");
    out.add("pet_friendly");
  }

  if (input.is_waterfront || /\bwaterfront\b/i.test(text)) out.add("waterfront");
  if (hasAny(nearby, /\bbeach\b/i) || /\bbeach\b/i.test(text)) out.add("beach");
  if (/\bswim(?:ming)?\b/i.test(text)) out.add("lake_swim");
  if (input.site_type === "backcountry" || /\bbackcountry\b/i.test(text)) out.add("backcountry");
  if (policies.walkIn === true || policies.noVehicles === true || /\b(?:walk[-\s]?in|ski[-\s]?in|no vehicles?)\b/i.test(text)) out.add("walk_in");
  if (/\bportage\b/i.test(text)) out.add("portage");
  if (policies.radioFree === true || /\bradio[-\s]?free\b/i.test(text)) out.add("radio_free");
  if (policies.generatorFree === true || /\bgenerator[-\s]?free\b/i.test(text)) out.add("generator_free");
  if (policies.tentsOnly === true || /\btents?\s+only\b/i.test(text)) out.add("tents_only");
  if (policies.noVehicles === true || /\bno vehicles?\b/i.test(text)) out.add("no_vehicles");

  if (hasTruthyString(comfort.waterTap) || typeof comfort.waterTapDistanceM === "number" || hasAny(nearby, /\bwater tap\b/i)) out.add("water_tap");
  if (hasTruthyString(comfort.showers) || typeof comfort.showerDistanceM === "number" || hasAny(nearby, /\b(showers?|comfort station with showers|washroom with showers)\b/i)) out.add("showers");
  if (
    /^(?:indoor|flush)$/i.test(String(comfort.toilet ?? "")) ||
    hasAny(nearby, /\b(?:comfort station|washrooms?|restrooms?)\b/i)
  ) {
    out.add("flush_toilets");
  }
  if (hasAny(nearby, /\bprivy\b/i) || /privy|outhouse|composting toilet/i.test(text)) out.add("privy");
  if (hasAny(nearby, /\bbody of water|lake|stream|river\b/i)) out.add("near_water");
  if (hasAny(nearby, /\bplayground\b/i)) out.add("playground");

  for (const amenity of rawAmenities) out.add(amenity);
  return Array.from(out);
}
