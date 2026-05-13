import type { RuleHighlight, Site } from "@/lib/types";

export type SitePetPolicy = "pet-friendly" | "no-pets" | null;

export function getSitePetPolicy(site: Pick<Site, "is_pet_friendly" | "rule_summary">): SitePetPolicy {
  const policies = site.rule_summary?.policies;
  if (policies?.noPets === true || policies?.dogsAllowed === false) return "no-pets";
  if (site.is_pet_friendly || policies?.dogsAllowed === true) return "pet-friendly";
  return null;
}

export function isPetPolicyHighlight(rule: Pick<RuleHighlight, "label">): boolean {
  return /^(no pets|pet[-\s]?friendly|pets)$/i.test(rule.label);
}
