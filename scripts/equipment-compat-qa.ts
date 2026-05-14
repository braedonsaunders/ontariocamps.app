import assert from "node:assert/strict";
import {
  allowedEquipmentSupportsRequest,
  maxEquipmentLengthFromLabel,
} from "../lib/equipment-normalization";
import type { SourceEquipmentRule } from "../lib/types";

function rule(label: string): SourceEquipmentRule {
  return {
    equipmentCategoryId: -32768,
    subEquipmentCategoryId: label.length * -1,
    label,
  };
}

function assertSupports(
  label: string,
  allowed: SourceEquipmentRule[],
  kind: string,
  lengthFt: number,
  expected: boolean | null,
) {
  assert.equal(
    allowedEquipmentSupportsRequest(allowed, kind, lengthFt),
    expected,
    `${label}: expected ${kind} ${lengthFt}ft support to be ${expected}`,
  );
}

const ontario25 = [
  rule("Single Tent"),
  rule("2 Tents"),
  rule("Trailer or RV up to 18ft (5.5m)"),
  rule("Trailer or RV up to 25ft (7.6m)"),
];
const parksCanadaVanTentTrailer = [
  rule("Small Tent"),
  rule("Medium Tent"),
  rule("Large Tent"),
  rule("Van/Pickup"),
  rule("Tent Trailer"),
];
const parksCanada24 = [
  ...parksCanadaVanTentTrailer,
  rule("Trailer or Motorhome up to 21ft"),
  rule("Trailer or Motorhome up to 24ft"),
];
const parksCanada27 = [
  ...parksCanada24,
  rule("Trailer or Motorhome up to 27ft"),
];

assert.equal(maxEquipmentLengthFromLabel("Trailer or RV up to 25ft (7.6m)"), 25);
assert.equal(maxEquipmentLengthFromLabel("Trailer or RV over 32ft (9.7m)"), 999);
assert.equal(maxEquipmentLengthFromLabel("Trailer or Motorhome up to 27ft"), 27);
assert.equal(maxEquipmentLengthFromLabel("Van/Pickup"), 21);
assert.equal(maxEquipmentLengthFromLabel("Tent Trailer"), 21);

assertSupports("Ontario 24ft trailer uses 25ft bucket", ontario25, "trailer", 24, true);
assertSupports("Ontario 25ft trailer uses 25ft bucket", ontario25, "trailer", 25, true);
assertSupports("Ontario 27ft trailer does not use 25ft bucket", ontario25, "trailer", 27, false);

assertSupports("Parks Canada van bucket supports camper van", parksCanadaVanTentTrailer, "camper_van", 21, true);
assertSupports("Parks Canada tent trailer bucket supports tent trailer", parksCanadaVanTentTrailer, "tent_trailer", 21, true);
assertSupports("Parks Canada van/tent-trailer site does not support travel trailer", parksCanadaVanTentTrailer, "trailer", 21, false);

assertSupports("Parks Canada 24ft bucket supports 24ft trailer", parksCanada24, "trailer", 24, true);
assertSupports("Parks Canada 24ft bucket rejects 25ft trailer", parksCanada24, "trailer", 25, false);
assertSupports("Parks Canada 27ft bucket supports 25ft trailer", parksCanada27, "trailer", 25, true);
assertSupports("Parks Canada 27ft bucket supports 27ft trailer", parksCanada27, "trailer", 27, true);
assertSupports("Parks Canada 27ft bucket rejects 32ft trailer", parksCanada27, "trailer", 32, false);

assertSupports("No allowed equipment is unknown", [], "trailer", 25, null);
assertSupports("Tent-only allowed equipment rejects trailer", [rule("Small Tent")], "trailer", 25, false);

console.log("equipment compatibility QA passed");
