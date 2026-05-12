"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Dog,
  Flame,
  Info,
  Leaf,
  MegaphoneOff,
  Moon,
  ParkingCircle,
  Ruler,
  ShieldCheck,
  Tent,
  TreePine,
  Users,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { OperatorRuleSource, RuleHighlight, RuleItem, Site, SiteRuleSummary } from "@/lib/types";

type Props = {
  parkName: string;
  operatorName: string;
  operatorRuleSource: OperatorRuleSource | null;
  sites: Site[];
  totalSites: number;
  vendorUrl: string;
  lastCheckedAt: string | null;
  onOpenSiteDetails?: (siteId: string) => void;
};

function toneClass(tone?: string) {
  if (tone === "emerald") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (tone === "amber") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (tone === "red") return "bg-red-50 text-red-700 ring-red-200";
  if (tone === "lake") return "bg-lake-50 text-lake-800 ring-lake-200";
  return "bg-stone-100 text-stone-700 ring-stone-200";
}

function ruleSummary(site: Site): SiteRuleSummary | null {
  const summary = site.rule_summary;
  if (!summary || typeof summary !== "object") return null;
  if (!Array.isArray(summary.highlights) || !summary.setup || !summary.character || !summary.policies) return null;
  return summary;
}

function siteHighlights(site: Site): RuleHighlight[] {
  return ruleSummary(site)?.highlights ?? [];
}

function addCount(map: Map<string, number>, label: string | null | undefined) {
  if (!label) return;
  map.set(label, (map.get(label) ?? 0) + 1);
}

function addCounts(map: Map<string, number>, labels: string[] | undefined) {
  for (const label of labels ?? []) addCount(map, label);
}

function topCounts(map: Map<string, number>, limit = 8) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function yesCount(sites: Site[], predicate: (summary: SiteRuleSummary) => boolean | undefined | null) {
  let n = 0;
  for (const site of sites) {
    const summary = ruleSummary(site);
    if (summary && predicate(summary)) n += 1;
  }
  return n;
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "stone",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone?: "stone" | "emerald" | "amber" | "red" | "lake";
}) {
  const iconTone =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "amber"
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : tone === "red"
      ? "bg-red-50 text-red-700 ring-red-200"
      : tone === "lake"
      ? "bg-lake-50 text-lake-800 ring-lake-200"
      : "bg-stone-100 text-stone-600 ring-stone-200";
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-stone-950">{value}</div>
        </div>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${iconTone}`}>
          <Icon size={15} />
        </span>
      </div>
      <div className="mt-1 text-xs leading-relaxed text-stone-500">{sub}</div>
    </div>
  );
}

function SourceRule({ rule }: { rule: RuleItem }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-stone-200">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-stone-900">{rule.label}</div>
        {rule.tone && <span className={`h-2 w-2 rounded-full ${rule.tone === "red" ? "bg-red-500" : "bg-amber-500"}`} />}
      </div>
      <div className="mt-1 text-xs leading-relaxed text-stone-600">{rule.value}</div>
      {rule.note && <div className="mt-1 text-[11px] text-stone-500">{rule.note}</div>}
    </div>
  );
}

function CountChips({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: Array<[string, number]>;
  empty: string;
  tone?: string;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-stone-950">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">{empty}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {items.map(([label, count]) => (
            <span key={label} className={`chip ring-1 ${toneClass(tone)}`}>
              {label}
              <span className="text-stone-400">{count}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export function SiteRulesCard({ site, operatorName }: { site: Site; operatorName: string }) {
  const summary = ruleSummary(site);
  if (!summary || summary.highlights.length === 0) {
    return (
      <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
        <h3 className="text-sm font-semibold text-stone-950">Rules and Site Notes</h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          No structured rule metadata has been decoded for this site yet. Check {operatorName} before arrival.
        </p>
      </section>
    );
  }

  const rows: Array<[string, string | null | undefined]> = [
    ["Service", summary.setup.electricalService ?? summary.setup.serviceType],
    ["Privacy", summary.character.privacy],
    ["Shade", summary.character.shade],
    ["Quality", summary.character.quality],
    ["Ground", summary.character.groundCover.join(", ")],
    ["Nearby", summary.nearby.slice(0, 4).join(", ")],
    ["Pad slope", summary.character.padSlope],
    ["Fire pit", summary.character.firePitLocation ?? summary.character.firePit],
    ["Water tap", summary.comfort.waterTapDistanceM ? `${summary.comfort.waterTapDistanceM} m away` : summary.comfort.waterTap],
    ["Toilet", summary.comfort.toiletDistanceM ? `${summary.comfort.toiletDistanceM} m away` : summary.comfort.toilet],
  ];

  return (
    <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
      <h3 className="text-sm font-semibold text-stone-950">Rules and Site Notes</h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {summary.highlights.map((h) => (
          <span key={h.label} className={`chip ring-1 ${toneClass(h.tone)}`}>{h.label}</span>
        ))}
      </div>
      {summary.restrictions.length > 0 && (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
          Restrictions: {summary.restrictions.join(", ")}
        </div>
      )}
      <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {rows.filter(([, value]) => Boolean(value)).slice(0, 10).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-stone-100 pb-1.5">
            <dt className="text-stone-500">{label}</dt>
            <dd className="text-right font-medium text-stone-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RulesPanel({
  parkName,
  operatorName,
  operatorRuleSource,
  sites,
  totalSites,
  vendorUrl,
  lastCheckedAt,
  onOpenSiteDetails,
}: Props) {
  const withRules = sites.filter((site) => ruleSummary(site));
  const restrictions = new Map<string, number>();
  const conditions = new Map<string, number>();
  const nearby = new Map<string, number>();
  const shade = new Map<string, number>();
  const privacy = new Map<string, number>();
  const quality = new Map<string, number>();
  const service = new Map<string, number>();

  for (const site of withRules) {
    const summary = ruleSummary(site)!;
    addCounts(restrictions, summary.restrictions);
    addCounts(conditions, summary.character.conditions);
    addCounts(nearby, summary.nearby);
    addCount(shade, summary.character.shade);
    addCount(privacy, summary.character.privacy);
    addCount(quality, summary.character.quality);
    addCount(service, summary.setup.electricalService ?? summary.setup.serviceType);
  }

  const radioFree = yesCount(sites, (s) => s.policies.radioFree);
  const generatorFree = yesCount(sites, (s) => s.policies.generatorFree);
  const noPets = yesCount(sites, (s) => s.policies.noPets || s.policies.dogsAllowed === false);
  const walkIn = yesCount(sites, (s) => s.policies.walkIn || s.policies.noVehicles);
  const pullThrough = yesCount(sites, (s) => s.setup.pullThrough);
  const barrierFree = yesCount(sites, (s) => s.setup.barrierFree);
  const notableSites = sites
    .map((site) => ({ site, highlights: siteHighlights(site).filter((h) => h.tone === "red" || h.tone === "amber" || h.category === "restriction") }))
    .filter((entry) => entry.highlights.length > 0)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-stone-950 p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15">
              <ShieldCheck size={13} /> Operator supplied and official-source rules
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Rules for {parkName}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/75">
              A quick read on campsite policies, restrictions, and site-level quirks before you click through to {operatorName}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={vendorUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary bg-white text-stone-900 hover:bg-stone-100">
              Book with {operatorName} <ArrowUpRight size={14} />
            </a>
            {operatorRuleSource?.alerts_url && (
              <a href={operatorRuleSource.alerts_url} target="_blank" rel="noopener noreferrer" className="btn-secondary bg-white/10 text-white ring-white/20 hover:bg-white/15">
                Alerts <Bell size={14} />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile icon={Info} label="Decoded sites" value={`${withRules.length.toLocaleString()}/${totalSites.toLocaleString()}`} sub="Sites with structured operator rule metadata" />
        <StatTile icon={MegaphoneOff} label="Quiet signals" value={(radioFree + generatorFree).toLocaleString()} sub={`${radioFree} radio-free, ${generatorFree} generator-free`} tone="emerald" />
        <StatTile icon={Dog} label="Pet restrictions" value={noPets.toLocaleString()} sub="Sites explicitly marked no pets or dogs not allowed" tone={noPets > 0 ? "amber" : "stone"} />
        <StatTile icon={ParkingCircle} label="Walk-in / no vehicles" value={walkIn.toLocaleString()} sub="Sites with access restrictions" tone={walkIn > 0 ? "lake" : "stone"} />
        <StatTile icon={Ruler} label="Pull-through" value={pullThrough.toLocaleString()} sub="Sites marked pull-through by the operator" />
        <StatTile icon={BadgeCheck} label="Barrier-free" value={barrierFree.toLocaleString()} sub="Sites marked barrier-free or accessible" tone="emerald" />
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Official rule summary</h2>
            <p className="mt-1 text-sm text-stone-600">
              Condensed from {operatorRuleSource?.source_label ?? `${operatorName} public camping policies`}.
            </p>
          </div>
          {operatorRuleSource?.source_url && (
            <a href={operatorRuleSource.source_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-forest-700 hover:text-forest-800">
              Source <ArrowUpRight size={13} className="inline" />
            </a>
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(operatorRuleSource?.rules ?? []).map((rule) => <SourceRule key={rule.label} rule={rule} />)}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-stone-500">
          Rules can change, and park staff have the final say. Use this as a planning layer, then verify the official page and any alerts before departure.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5 space-y-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Site-level rules</h2>
            <p className="mt-1 text-sm text-stone-600">
              Decoded from reservation-system attributes for individual campsites.
            </p>
          </div>
          <CountChips title="Restrictions" items={topCounts(restrictions)} empty="No explicit restrictions decoded for this park." tone="amber" />
          <CountChips title="Service and setup" items={topCounts(service)} empty="No service labels decoded yet." />
        </section>

        <section className="card p-5 space-y-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Campsite character</h2>
            <p className="mt-1 text-sm text-stone-600">
              The decision-making details campers usually have to hunt for in screenshots.
            </p>
          </div>
          <CountChips title="Shade" items={topCounts(shade, 5)} empty="No shade ratings decoded yet." tone="emerald" />
          <CountChips title="Privacy" items={topCounts(privacy, 5)} empty="No privacy ratings decoded yet." />
          <CountChips title="Quality" items={topCounts(quality, 5)} empty="No site quality ratings decoded yet." />
        </section>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Nearby, comfort, and caution flags</h2>
            <p className="mt-1 text-sm text-stone-600">
              Useful planning details pulled from campsite attributes.
            </p>
          </div>
          {lastCheckedAt && <span className="text-xs text-stone-500">Rule data follows the metadata ingest cadence</span>}
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <CountChips title="Adjacent to" items={topCounts(nearby, 10)} empty="No nearby features decoded yet." tone="lake" />
          <CountChips title="Conditions" items={topCounts(conditions, 10)} empty="No caution conditions decoded yet." tone="red" />
        </div>
      </section>

      {notableSites.length > 0 && (
        <section className="card p-5">
          <h2 className="text-xl font-semibold tracking-tight">Notable campsite flags</h2>
          <div className="mt-4 divide-y divide-stone-100">
            {notableSites.map(({ site, highlights }) => (
              <div key={site.id} className="flex flex-wrap items-center gap-3 py-3">
                {onOpenSiteDetails ? (
                  <button type="button" onClick={() => onOpenSiteDetails(site.id)} className="font-medium text-stone-900 hover:text-forest-700">
                    Site {site.name}
                  </button>
                ) : (
                  <span className="font-medium text-stone-900">Site {site.name}</span>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {highlights.map((h) => (
                    <span key={h.label} className={`chip ring-1 ${toneClass(h.tone)}`}>{h.label}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
          <Moon size={16} className="text-stone-400" />
          <div className="mt-2 text-sm font-semibold text-stone-950">Quiet planning</div>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">Look for radio-free, generator-free, good privacy, and low-traffic conditions.</p>
        </div>
        <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
          <TreePine size={16} className="text-stone-400" />
          <div className="mt-2 text-sm font-semibold text-stone-950">Site fit</div>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">Use shade, slope, ground cover, site length, and obstructions before committing.</p>
        </div>
        <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
          <AlertTriangle size={16} className="text-stone-400" />
          <div className="mt-2 text-sm font-semibold text-stone-950">Final check</div>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">Fire bans, beach postings, alcohol bans, and closures can change close to arrival.</p>
        </div>
      </section>
    </div>
  );
}
