import Link from "next/link";
import type { Metadata } from "next";
import { sql } from "@/lib/db/client";
import { Tent, MapPin, Activity, ExternalLink } from "lucide-react";
import { MotionFadeUp, MotionStagger, MotionStaggerItem } from "@/components/motion";

export const metadata: Metadata = {
  title: "Operators",
  description: "Every Ontario campsite operator we index — Ontario Parks, Parks Canada, and Conservation Authorities.",
};
export const dynamic = "force-dynamic";

type OperatorCard = {
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

function operatorGroup(vendor: string, id: string): "Provincial" | "Federal" | "Conservation Authorities" {
  if (vendor === "camis5") return "Provincial";
  if (vendor === "pcrs") return "Federal";
  if (id.startsWith("gtc_")) return "Conservation Authorities";
  return "Conservation Authorities";
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

export default async function OperatorsIndexPage() {
  // One query joins operators + their best-looking park hero photo (highest
  // availability_pct so it tends to be a visually-featured park) so we can
  // build the card backgrounds in a single round-trip.
  const operators = await sql()<OperatorCard[]>`
    SELECT o.id, o.name, o.vendor, o.base_url, o.website_url, o.logo_url, o.accent_color, o.tagline,
           o.total_parks, o.total_sites, o.available_sites, o.last_availability_at,
           hero.hero_image_url, hero.featured_park
      FROM operators o
      LEFT JOIN LATERAL (
        SELECT p.hero_image_url, p.name AS featured_park
          FROM parks p
         WHERE p.operator_id = o.id
           AND p.hero_image_url IS NOT NULL
         ORDER BY p.total_sites DESC NULLS LAST
         LIMIT 1
      ) hero ON true
     ORDER BY o.total_sites DESC
  `;

  const opsByGroup = new Map<string, OperatorCard[]>();
  for (const o of operators) {
    const g = operatorGroup(o.vendor, o.id);
    if (!opsByGroup.has(g)) opsByGroup.set(g, []);
    opsByGroup.get(g)!.push(o);
  }

  const totalParks = operators.reduce((s, o) => s + o.total_parks, 0);
  const totalSites = operators.reduce((s, o) => s + o.total_sites, 0);
  const totalAvail = operators.reduce((s, o) => s + o.available_sites, 0);
  const ORDER = ["Provincial", "Federal", "Conservation Authorities"] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <MotionFadeUp className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Operators</h1>
          <p className="text-stone-600 mt-1 max-w-2xl">
            Every campsite operator we index — Ontario Parks, Parks Canada, and the Conservation Authorities
            that run camping on Camis-built booking platforms.
          </p>
        </div>
        <div className="flex gap-5 text-sm text-stone-600">
          <div><span className="text-2xl font-semibold text-stone-900 mr-1">{operators.length}</span>operators</div>
          <div><span className="text-2xl font-semibold text-stone-900 mr-1">{totalParks}</span>parks</div>
          <div><span className="text-2xl font-semibold text-stone-900 mr-1">{totalSites.toLocaleString()}</span>sites</div>
          <div><span className="text-2xl font-semibold text-emerald-700 mr-1">{totalAvail.toLocaleString()}</span>open</div>
        </div>
      </MotionFadeUp>

      {ORDER.filter((g) => opsByGroup.has(g)).map((group, gi) => (
        <section key={group} className="mt-10">
          <MotionFadeUp delay={0.05 + gi * 0.05}>
            <h2 className="text-xs uppercase tracking-wide font-semibold text-stone-500 mb-3">{group}</h2>
          </MotionFadeUp>
          <MotionStagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {opsByGroup.get(group)!.map((o) => {
              const minutes = minutesSince(o.last_availability_at);
              const accent = o.accent_color ?? "#1F6E3D";
              const pct = o.total_sites > 0 ? Math.round((100 * o.available_sites) / o.total_sites) : 0;
              return (
                <MotionStaggerItem key={o.id}>
                <Link
                  href={`/operator/${o.id}`}
                  className="group relative overflow-hidden rounded-xl ring-1 ring-stone-200 hover:ring-stone-300 hover:shadow-lg transition-all duration-300 bg-white block"
                  style={{ boxShadow: `0 1px 0 ${accent}1a inset` }}
                >
                  {/* Hero image strip on top, gracefully scales when absent */}
                  <div
                    className="relative h-32 overflow-hidden"
                    style={{ backgroundColor: accent }}
                  >
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
                    {/* Logo plate (white tile, fixed height for visual consistency) */}
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
                        {o.tagline && (
                          <div className="text-xs text-stone-500 mt-0.5 line-clamp-1">{o.tagline}</div>
                        )}
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
                        <div className="font-semibold tabular-nums text-stone-900 mt-0.5">{o.total_sites.toLocaleString()}</div>
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
                        <span
                          className="inline-flex items-center gap-1 font-medium"
                          style={{ color: accent }}
                        >
                          Browse parks <ExternalLink size={10} />
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
                </MotionStaggerItem>
              );
            })}
          </MotionStagger>
        </section>
      ))}

      <div className="mt-12 card p-5 text-sm text-stone-600">
        <div className="font-semibold text-stone-900 mb-1">Three platforms, one search</div>
        Provincial parks are run by Ontario Parks on Camis&apos;s Camis5 platform. Federal parks in Ontario are run by
        Parks Canada on PCRSv3. Each Conservation Authority is independent but most run the same Camis-built
        GoingToCamp product, so a single API surface powers the index. Per-night availability is refreshed every
        15 minutes during the day.
      </div>
    </div>
  );
}
