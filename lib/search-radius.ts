export const DEFAULT_SEARCH_RADIUS_KM = 150;
export const MIN_SEARCH_RADIUS_KM = 10;
export const MAX_SEARCH_RADIUS_KM = 1000;

export function normalizeSearchRadiusKm(value: unknown): number {
  const n = typeof value === "string" && value.trim() === "" ? DEFAULT_SEARCH_RADIUS_KM : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SEARCH_RADIUS_KM;
  return Math.max(MIN_SEARCH_RADIUS_KM, Math.min(MAX_SEARCH_RADIUS_KM, Math.round(n)));
}
