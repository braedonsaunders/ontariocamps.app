import type { SourceEquipmentRule } from "./types";

export type RequestedEquipmentKind = "any" | "tent" | "camper_van" | "tent_trailer" | "trailer" | "roofed";

const WHEELED_LABEL_PATTERN = /\b(?:rv|trailer|motorhome|camper|van|pickup|fifth|5th)\b/i;
const VAN_LABEL_PATTERN = /\b(?:van\/pickup|camper\s*van|van|pickup|truck\s*camper)\b/i;
const TENT_TRAILER_LABEL_PATTERN = /\b(?:tent\s*trailer|tent-trailer|pop[-\s]?up|folding\s*trailer)\b/i;
const TRAILER_MOTORHOME_LABEL_PATTERN = /\b(?:rv|motorhome|fifth|5th|travel\s*trailer)\b/i;
const FEET_PATTERN = /(?:ft|feet|')/i;
const OPEN_ENDED_LENGTH_FT = 999;
const DEFAULT_COMPACT_LENGTH_FT = 21;

function normalizeLabel(label: string): string {
  return label
    .replace(/[’‘`]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function numbers(label: string): number[] {
  return Array.from(label.matchAll(/\d+(?:\.\d+)?/g))
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));
}

function isWheeledLabel(label: string): boolean {
  return WHEELED_LABEL_PATTERN.test(label);
}

export function normalizeRequestedEquipmentKind(kind: string | null | undefined): RequestedEquipmentKind {
  if (kind === "small_rv" || kind === "rv" || kind === "large_rv") return "trailer";
  if (
    kind === "tent" ||
    kind === "camper_van" ||
    kind === "tent_trailer" ||
    kind === "trailer" ||
    kind === "roofed"
  ) {
    return kind;
  }
  return "any";
}

function equipmentKindFromLabel(label: string): "tent" | "camper_van" | "tent_trailer" | "trailer" | null {
  const normalized = normalizeLabel(label);
  if (TENT_TRAILER_LABEL_PATTERN.test(normalized)) return "tent_trailer";
  if (VAN_LABEL_PATTERN.test(normalized)) return "camper_van";
  if (TRAILER_MOTORHOME_LABEL_PATTERN.test(normalized) || /\btrailer\b/i.test(normalized)) return "trailer";
  if (/\btents?\b/i.test(normalized)) return "tent";
  return null;
}

export function maxEquipmentLengthFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const normalized = normalizeLabel(label);
  if (!isWheeledLabel(normalized)) return null;
  const lower = normalized.toLowerCase();
  const values = numbers(normalized);

  if (/\b(?:over|more than|greater than)\b/.test(lower) || /\d+(?:\.\d+)?\s*(?:ft|feet|')?\s*\+/.test(lower)) {
    return OPEN_ENDED_LENGTH_FT;
  }

  const range = normalized.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')?/i);
  if (range) return Math.round(Number(range[2]));

  const upTo = normalized.match(/(?:up\s*to|under|less than|<=?)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|')?/i);
  if (upTo) return Math.round(Number(upTo[1]));

  if (values.length > 0 && FEET_PATTERN.test(normalized)) return Math.round(Math.max(...values));
  const kind = equipmentKindFromLabel(normalized);
  if (kind === "camper_van" || kind === "tent_trailer") return DEFAULT_COMPACT_LENGTH_FT;
  return null;
}

export function allowedEquipmentMaxLengthFt(raw: unknown): number | null {
  const allowed = Array.isArray(raw) ? (raw as SourceEquipmentRule[]) : [];
  let max: number | null = null;
  for (const item of allowed) {
    const labelMax = maxEquipmentLengthFromLabel(item.label);
    if (labelMax == null) continue;
    max = Math.max(max ?? 0, labelMax);
  }
  return max;
}

export function allowedEquipmentSupportsLength(raw: unknown, requestedLengthFt: number): boolean | null {
  const allowed = Array.isArray(raw) ? (raw as SourceEquipmentRule[]) : [];
  const rvLabels = allowed.map((item) => item.label).filter((label): label is string => Boolean(label && isWheeledLabel(label)));
  if (rvLabels.length === 0) return null;
  const maxes = rvLabels
    .map((label) => maxEquipmentLengthFromLabel(label))
    .filter((max): max is number => max != null);
  if (maxes.length === 0) return null;
  return maxes.some((max) => max >= requestedLengthFt);
}

export function allowedEquipmentSupportsRequest(
  raw: unknown,
  requestedKind: string | null | undefined,
  requestedLengthFt: number | null | undefined,
): boolean | null {
  const kind = normalizeRequestedEquipmentKind(requestedKind);
  if (kind === "any" || kind === "tent" || kind === "roofed") return null;

  const allowed = Array.isArray(raw) ? (raw as SourceEquipmentRule[]) : [];
  const labels = allowed.map((item) => item.label).filter((label): label is string => Boolean(label));
  if (labels.length === 0) return null;

  const wheeled = labels
    .map((label) => ({ label, kind: equipmentKindFromLabel(label), maxLengthFt: maxEquipmentLengthFromLabel(label) }))
    .filter((entry) => entry.kind === "camper_van" || entry.kind === "tent_trailer" || entry.kind === "trailer");

  if (wheeled.length === 0) return false;

  const requestedLength = typeof requestedLengthFt === "number" && Number.isFinite(requestedLengthFt) && requestedLengthFt > 0
    ? Math.round(requestedLengthFt)
    : undefined;

  if (kind === "trailer") {
    const genericTrailer = wheeled.filter((entry) => entry.kind === "trailer");
    if (genericTrailer.length === 0) return false;
    if (!requestedLength) return true;
    const maxes = genericTrailer.map((entry) => entry.maxLengthFt).filter((max): max is number => max != null);
    return maxes.length > 0 ? maxes.some((max) => max >= requestedLength) : null;
  }

  const exact = wheeled.filter((entry) => entry.kind === kind);
  if (exact.length > 0) {
    if (!requestedLength) return true;
    const exactMaxes = exact.map((entry) => entry.maxLengthFt).filter((max): max is number => max != null);
    if (exactMaxes.some((max) => max >= requestedLength)) return true;
  }

  const genericTrailer = wheeled.filter((entry) => entry.kind === "trailer");
  if (genericTrailer.length === 0) return false;
  if (!requestedLength) return true;
  const maxes = genericTrailer.map((entry) => entry.maxLengthFt).filter((max): max is number => max != null);
  return maxes.length > 0 ? maxes.some((max) => max >= requestedLength) : null;
}
