"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Search, Tent, MapPin, Activity, ExternalLink, X } from "lucide-react";

type OperatorRow = {
  id: string;
  name: string;
  vendor: string;
  base_url: string;
  website_url: string | null;
  logo_url: string | null;
  accent_color: string | null;
  tagline: string | null;
  total_parks: number;
  total_sites: number;
  available_sites: number;
  last_availability_at: Date | string | null;
  hero_image_url: string | null;
  featured_park: string | null;
};

type ParkRow = {
  slug: string;
  name: string;
  operator_id: string;
  operator: string;
  region: string;
  hero_image_url: string | null;
  total_sites: number;
  available_sites: number;
  availability_pct: number;
  accent_color: string | null;
};

type Tab = "networks" | "parks";

function networkCategory(vendor: string, id: string): "Provincial" | "Federal" | "Conservation" {
  if (vendor === "camis5") return "Provincial";
  if (vendor === "pcrs") return "Federal";
  if (id.startsWith("gtc_")) return "Conservation";
  return "Conservation";
}
function categoryChipClasses(cat: string): string {
  switch (cat) {
    case "Provincial":
      return "bg-forest-50 text-forest-800 ring-forest-200";
    case "Federal":
      return "bg-red-50 text-red-800 ring-red-200";
    default:
      return "bg-lake-50 text-lake-800 ring-lake-200";
  }
}
function minutesSince(at: Date | string | null): number {
  if (!at) return 0;
  const ms = at instanceof Date ? at.getTime() : new Date(String(at)).getTime();
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}
function initials(name: string): string {
  return name
    .replace(/Conservation Authority|Conservation|Region|Provincial Parks?/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/** Case-insensitive substring match against a haystack of strings. */
function matchesQuery(haystacks: Array<string | null | undefined>, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return haystacks.some((h) => h && h.toLowerCase().includes(needle));
}

export function ParksDirectory({
  operators,
  parks,
}: {
  operators: OperatorRow[];
  parks: ParkRow[];
}) {
  const [tab, setTab] = useState<Tab>("networks");
  const [query, setQuery] = useState("");

  const filteredOperators = useMemo(
    () =>
      operators.filter((o) => matchesQuery([o.name, o.tagline, networkCategory(o.vendor, o.id)], query)),
    [operators, query],
  );
  const filteredParks = useMemo(
    () =>
      parks.filter((p) => matchesQuery([p.name, p.operator, p.region], query)),
    [parks, query],
  );

  const totalParks = operators.reduce((s, o) => s + o.total_parks, 0);
  const totalSites = operators.reduce((s, o) => s + o.total_sites, 0);
  const totalAvail = operators.reduce((s, o) => s + o.available_sites, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Parks</h1>
          <p className="text-stone-600 mt-1 max-w-2xl">
            Every park and network we index — Ontario Parks, Parks Canada, and the Conservation Authorities
            that run camping in the province.
          </p>
        </div>
        <div className="flex gap-5 text-sm text-stone-600">
          <div>
            <span className="text-2xl font-semibold text-stone-900 mr-1">{operators.length}</span>networks
          </div>
          <div>
            <span className="text-2xl font-semibold text-stone-900 mr-1">{totalParks}</span>parks
          </div>
          <div>
            <span className="text-2xl font-semibold text-stone-900 mr-1">{totalSites.toLocaleString()}</span>sites
          </div>
          <div>
            <span className="text-2xl font-semibold text-emerald-700 mr-1">{totalAvail.toLocaleString()}</span>open tonight
          </div>
        </div>
      </div>

      {/* Tabs + search row */}
      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="border-b border-stone-200 grid grid-cols-2 items-end gap-1 -mb-px w-full sm:w-auto">
          {(
            [
              { id: "networks" as Tab, label: `Networks (${filteredOperators.length})` },
              { id: "parks" as Tab, label: `Parks (${filteredParks.length.toLocaleString()})` },
            ]
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors sm:min-w-36 ${
                  active ? "text-forest-700" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {t.label}
                {active && (
                  <motion.span
                    layoutId="parks-tab-underline"
                    className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-forest-600"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder={tab === "networks" ? "Search networks…" : "Search parks…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="field pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {tab === "networks" ? (
        <NetworksGrid operators={filteredOperators} />
      ) : (
        <ParksGrid parks={filteredParks} />
      )}
    </div>
  );
}

function NetworksGrid({ operators }: { operators: OperatorRow[] }) {
  if (operators.length === 0) {
    return (
      <div className="mt-10 card p-8 text-center text-stone-500">No networks match your search.</div>
    );
  }
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {operators.map((o) => {
        const cat = networkCategory(o.vendor, o.id);
        const minutes = minutesSince(o.last_availability_at);
        const accent = o.accent_color ?? "#1F6E3D";
        const pct = o.total_sites > 0 ? Math.round((100 * o.available_sites) / o.total_sites) : 0;
        return (
          <Link
            key={o.id}
            href={`/operator/${o.id}`}
            className="group relative overflow-hidden rounded-xl ring-1 ring-stone-200 hover:ring-stone-300 hover:shadow-lg transition-all duration-300 bg-white block"
            style={{ boxShadow: `0 1px 0 ${accent}1a inset` }}
          >
            <div className="relative h-32 overflow-hidden" style={{ backgroundColor: accent }}>
              {o.hero_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.hero_image_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-90 group-hover:scale-[1.02] transition-transform duration-500"
                />
              ) : null}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(180deg, ${accent}00 0%, ${accent}40 60%, ${accent}cc 100%)`,
                }}
              />
              <span className={`absolute top-3 left-3 chip ring-1 ${categoryChipClasses(cat)} bg-white/90 backdrop-blur-sm text-xs`}>
                {cat}
              </span>
              <div className="absolute left-4 bottom-3 h-10 px-3 inline-flex items-center gap-2 rounded-md bg-white/95 backdrop-blur-sm shadow-sm ring-1 ring-black/5">
                {o.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.logo_url}
                    alt={`${o.name} logo`}
                    className="h-6 max-w-[120px] w-auto object-contain"
                  />
                ) : (
                  <>
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white"
                      style={{ backgroundColor: accent }}
                    >
                      {initials(o.name)}
                    </span>
                    <span className="text-[11px] font-medium text-stone-700">{o.name.split(" ")[0]}</span>
                  </>
                )}
              </div>
              {o.featured_park && (
                <span className="absolute right-3 bottom-3 chip bg-black/40 text-white text-[10px] backdrop-blur-sm border-0">
                  {o.featured_park}
                </span>
              )}
            </div>

            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-stone-900 group-hover:text-forest-700 transition-colors truncate">
                    {o.name}
                  </div>
                  {o.tagline && <div className="text-xs text-stone-500 mt-0.5 line-clamp-1">{o.tagline}</div>}
                </div>
                <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> live
                </span>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone-500 flex items-center gap-1">
                    <MapPin size={10} /> Parks
                  </div>
                  <div className="font-semibold tabular-nums text-stone-900 mt-0.5">{o.total_parks}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone-500 flex items-center gap-1">
                    <Tent size={10} /> Sites
                  </div>
                  <div className="font-semibold tabular-nums text-stone-900 mt-0.5">
                    {o.total_sites.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone-500">Open</div>
                  <div className="font-semibold tabular-nums text-emerald-700 mt-0.5">
                    {o.available_sites.toLocaleString()}
                    <span className="text-[10px] text-stone-500 font-normal ml-1">{pct}%</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-stone-500 flex items-center gap-1">
                    <Activity size={10} /> Fresh
                  </div>
                  <div className="font-semibold tabular-nums text-stone-900 mt-0.5">{minutes}m</div>
                </div>
              </div>

              {o.website_url && (
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="text-stone-500 truncate">
                    {o.website_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium" style={{ color: accent }}>
                    Browse parks <ExternalLink size={10} />
                  </span>
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ParksGrid({ parks }: { parks: ParkRow[] }) {
  if (parks.length === 0) {
    return (
      <div className="mt-10 card p-8 text-center text-stone-500">No parks match your search.</div>
    );
  }
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {parks.map((p) => {
        const accent = p.accent_color ?? "#1F6E3D";
        const pct = p.availability_pct;
        const pctColor = pct >= 50 ? "text-emerald-700" : pct >= 15 ? "text-amber-700" : "text-red-700";
        return (
          <Link
            key={p.slug}
            href={`/park/${p.slug}`}
            className="group card overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 block"
          >
            <div className="relative h-36 bg-stone-200 overflow-hidden" style={{ backgroundColor: accent }}>
              {p.hero_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.hero_image_url}
                  alt={p.name}
                  className="absolute inset-0 h-full w-full object-cover opacity-95 group-hover:scale-[1.03] transition-transform duration-500"
                  loading="lazy"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent" />
              <span className="absolute top-2 left-2 chip bg-white/95 text-stone-700 ring-1 ring-stone-200 text-[10px]">
                {p.region}
              </span>
              <span
                className={`absolute top-2 right-2 chip bg-white/95 ring-1 ring-stone-200 text-[10px] ${pctColor}`}
              >
                {pct}% open
              </span>
            </div>
            <div className="p-4">
              <div className="font-semibold text-stone-900 group-hover:text-forest-700 transition-colors line-clamp-1">
                {p.name}
              </div>
              <div className="text-xs text-stone-500 mt-0.5 line-clamp-1">{p.operator}</div>
              <div className="mt-2 flex items-center gap-2 text-xs text-stone-600">
                <span className="inline-flex items-center gap-1">
                  <Tent size={11} /> {p.total_sites.toLocaleString()} sites
                </span>
                <span className="text-stone-300">·</span>
                <span className={`font-semibold ${pctColor}`}>
                  {p.available_sites.toLocaleString()} open
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
