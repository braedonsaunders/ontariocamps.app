export type SearchEquipmentId =
  | "any"
  | "tent"
  | "camper_van"
  | "tent_trailer"
  | "trailer"
  | "roofed";

export type SearchEquipmentOption = {
  id: SearchEquipmentId;
  label: string;
  shortLabel: string;
  description: string;
  siteTypes: string[];
  defaultLengthFt?: number;
  needsLength?: boolean;
};

export const EQUIPMENT_LENGTH_OPTIONS = [18, 21, 24, 25, 27, 32, 35, 40] as const;

export const SEARCH_EQUIPMENT_OPTIONS: SearchEquipmentOption[] = [
  {
    id: "any",
    label: "Any setup",
    shortLabel: "Any",
    description: "Show every bookable campsite",
    siteTypes: [],
  },
  {
    id: "tent",
    label: "Tent",
    shortLabel: "Tent",
    description: "Tent-friendly campsites, including standard drive-in sites",
    siteTypes: ["tent", "rv", "backcountry"],
  },
  {
    id: "camper_van",
    label: "Camper van",
    shortLabel: "Van",
    description: "Van or truck-camper sites",
    siteTypes: ["rv"],
    defaultLengthFt: 21,
    needsLength: true,
  },
  {
    id: "tent_trailer",
    label: "Tent trailer",
    shortLabel: "Tent trailer",
    description: "Tent-trailer and pop-up sites",
    siteTypes: ["rv"],
    defaultLengthFt: 21,
    needsLength: true,
  },
  {
    id: "trailer",
    label: "Trailer or motorhome",
    shortLabel: "Trailer/RV",
    description: "Travel trailer, fifth wheel, or motorhome",
    siteTypes: ["rv"],
    defaultLengthFt: 25,
    needsLength: true,
  },
  {
    id: "roofed",
    label: "Cabin or yurt",
    shortLabel: "Roofed",
    description: "Cabins and roofed camping",
    siteTypes: ["cabin", "yurt"],
  },
];

const LEGACY_EQUIPMENT_IDS: Record<string, SearchEquipmentId> = {
  small_rv: "trailer",
  rv: "trailer",
  large_rv: "trailer",
};

const LEGACY_EQUIPMENT_LENGTHS: Record<string, number> = {
  small_rv: 24,
  rv: 32,
  large_rv: 40,
};

export function searchEquipmentById(id: string | null | undefined): SearchEquipmentOption {
  const normalizedId = id ? (LEGACY_EQUIPMENT_IDS[id] ?? id) : id;
  return SEARCH_EQUIPMENT_OPTIONS.find((option) => option.id === normalizedId) ?? SEARCH_EQUIPMENT_OPTIONS[0];
}

export function defaultEquipmentLengthFt(id: string | null | undefined): number | undefined {
  if (id && LEGACY_EQUIPMENT_LENGTHS[id]) return LEGACY_EQUIPMENT_LENGTHS[id];
  return searchEquipmentById(id).defaultLengthFt;
}

export function normalizeEquipmentLengthFt(
  id: string | null | undefined,
  lengthFt: number | null | undefined,
): number | undefined {
  const option = searchEquipmentById(id);
  if (!option.needsLength) return undefined;
  if (typeof lengthFt === "number" && Number.isFinite(lengthFt) && lengthFt > 0) return Math.round(lengthFt);
  return defaultEquipmentLengthFt(id);
}

export function equipmentDisplayLabel(id: string | null | undefined, lengthFt?: number | null): string {
  const option = searchEquipmentById(id);
  const normalizedLength = normalizeEquipmentLengthFt(id, lengthFt);
  return normalizedLength ? `${option.shortLabel} ${normalizedLength} ft` : option.shortLabel;
}
