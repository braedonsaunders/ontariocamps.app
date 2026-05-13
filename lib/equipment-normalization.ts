import type { SourceEquipmentRule } from "./types";

const RV_LABEL_PATTERN = /\b(?:rv|trailer|motorhome|camper|van|fifth|5th)\b/i;
const COMPACT_RV_PATTERN = /\b(?:van|camper(?:\/tent)? trailer|tent trailer)\b/i;
const FEET_PATTERN = /(?:ft|feet|')/i;
const OPEN_ENDED_LENGTH_FT = 999;

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

function isRvLabel(label: string): boolean {
  return RV_LABEL_PATTERN.test(label);
}

export function maxEquipmentLengthFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const normalized = normalizeLabel(label);
  if (!isRvLabel(normalized)) return null;
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
  if (COMPACT_RV_PATTERN.test(normalized)) return 21;
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
  const rvLabels = allowed.map((item) => item.label).filter((label): label is string => Boolean(label && isRvLabel(label)));
  if (rvLabels.length === 0) return null;
  const maxes = rvLabels
    .map((label) => maxEquipmentLengthFromLabel(label))
    .filter((max): max is number => max != null);
  if (maxes.length === 0) return null;
  return maxes.some((max) => max >= requestedLengthFt);
}
