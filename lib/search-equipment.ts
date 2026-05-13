export type SearchEquipmentId =
  | "any"
  | "tent"
  | "small_rv"
  | "rv"
  | "large_rv"
  | "roofed";

export type SearchEquipmentOption = {
  id: SearchEquipmentId;
  label: string;
  shortLabel: string;
  description: string;
  siteTypes: string[];
  equipmentLengthFt?: number;
};

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
    id: "small_rv",
    label: "Camper van / small RV",
    shortLabel: "Small RV",
    description: "RV sites up to 24 ft",
    siteTypes: ["rv"],
    equipmentLengthFt: 24,
  },
  {
    id: "rv",
    label: "RV or trailer",
    shortLabel: "RV",
    description: "RV sites up to 32 ft",
    siteTypes: ["rv"],
    equipmentLengthFt: 32,
  },
  {
    id: "large_rv",
    label: "Large RV",
    shortLabel: "Large RV",
    description: "RV sites up to 40 ft",
    siteTypes: ["rv"],
    equipmentLengthFt: 40,
  },
  {
    id: "roofed",
    label: "Cabin or yurt",
    shortLabel: "Roofed",
    description: "Cabins and roofed camping",
    siteTypes: ["cabin", "yurt"],
  },
];

export function searchEquipmentById(id: string | null | undefined): SearchEquipmentOption {
  return SEARCH_EQUIPMENT_OPTIONS.find((option) => option.id === id) ?? SEARCH_EQUIPMENT_OPTIONS[0];
}
