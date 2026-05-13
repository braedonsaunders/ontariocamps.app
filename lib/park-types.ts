import type { ParkType } from "./types";

export const PARK_TYPE_OPTIONS: Array<{ id: ParkType; label: string; operatorIds: string[] }> = [
  { id: "provincial", label: "Provincial parks", operatorIds: ["ontario_parks", "st_lawrence_parks"] },
  { id: "conservation", label: "Conservation areas", operatorIds: [
    "gtc_lprca",
    "gtc_stclair",
    "gtc_grca",
    "gtc_trca",
    "gtc_npca",
    "gtc_otonabee",
    "gtc_upperthames",
    "gtc_maitland",
    "gtc_catfish",
    "gtc_hca",
    "letscamp_lowerthames",
    "letscamp_quinte",
    "campspot_rrca",
    "campspot_saugeen",
  ] },
  { id: "federal", label: "Federal parks", operatorIds: ["parks_canada"] },
  { id: "private", label: "Private campgrounds", operatorIds: ["campspot_ontario_private", "camplife_ontario_private"] },
];

const PARK_TYPE_BY_OPERATOR = new Map<string, ParkType>();
for (const option of PARK_TYPE_OPTIONS) {
  for (const operatorId of option.operatorIds) PARK_TYPE_BY_OPERATOR.set(operatorId, option.id);
}

export function parkTypesToOperators(types: string[] | null | undefined): string[] {
  const selected = new Set(types ?? []);
  if (selected.size === 0) return [];
  return Array.from(new Set(
    PARK_TYPE_OPTIONS
      .filter((option) => selected.has(option.id))
      .flatMap((option) => option.operatorIds),
  ));
}

export function operatorParkType(operatorId: string): ParkType {
  return PARK_TYPE_BY_OPERATOR.get(operatorId) ?? "private";
}
