import Link from "next/link";
import type { Metadata } from "next";
import { sql } from "@/lib/db/client";
import { ArrowUpRight, Tent, MapPin, Activity } from "lucide-react";

export const metadata: Metadata = {
  title: "Operators",
  description: "Every Ontario campsite operator we index — Ontario Parks, Parks Canada, and Conservation Authorities.",
};
export const dynamic = "force-dynamic";

type OperatorRow = {
  id: string;
  name: string;
  vendor: string;
  base_url: string;
  total_parks: number;
  total_sites: number;
  available_sites: number;
  last_availability_at: Date | string | null;
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

export default async function OperatorsIndexPage() {
  // ONE query. All columns come straight from the denormalized operators row.
  const operators = await sql()<OperatorRow[]>`
    SELECT id, name, vendor, base_url, total_parks, total_sites,
           available_sites, last_availability_at
      FROM operators
     ORDER BY total_sites DESC
  `;

  const opsByGroup = new Map<string, OperatorRow[]>();
  for (const o of operators) {
    const g = operatorGroup(o.vendor, o.id);
    if (!opsByGroup.has(g)) opsByGroup.set(g, []);
    opsByGroup.get(g)!.push(o);
  }

  const totalParks = operators.reduce((sum, o) => sum + o.total_parks, 0);
  const totalSites = operators.reduce((sum, o) => sum + o.total_sites, 0);
  const ORDER = ["Provincial", "Federal", "Conservation Authorities"] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">All operators</h1>
          <p className="text-stone-600 mt-1">
            Every campsite operator in the index — three federal/provincial agencies and the Conservation Authorities
            that run camping in Ontario.
          </p>
        </div>
        <div className="flex gap-4 text-sm text-stone-600">
          <div><span className="font-semibold text-stone-900">{operators.length}</span> operators</div>
          <div><span className="font-semibold text-stone-900">{totalParks}</span> parks</div>
          <div><span className="font-semibold text-stone-900">{totalSites.toLocaleString()}</span> sites</div>
        </div>
      </div>

      {ORDER.filter((g) => opsByGroup.has(g)).map((group) => (
        <section key={group} className="mt-10">
          <h2 className="text-xs uppercase tracking-wide font-semibold text-stone-500 mb-3">{group}</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {opsByGroup.get(group)!.map((o) => {
              const minutes = minutesSince(o.last_availability_at);
              return (
                <Link
                  key={o.id}
                  href={`/operator/${o.id}`}
                  className="card p-5 group transition hover:shadow-md hover:ring-stone-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-900 group-hover:text-forest-700 transition-colors">
                        {o.name}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5 truncate">
                        {o.base_url.replace(/^https?:\/\/(www\.)?/, "")}
                      </div>
                    </div>
                    <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> live
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-stone-500 flex items-center gap-1">
                        <MapPin size={11} /> Parks
                      </div>
                      <div className="font-semibold text-stone-900 mt-0.5">{o.total_parks.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-stone-500 flex items-center gap-1">
                        <Tent size={11} /> Sites
                      </div>
                      <div className="font-semibold text-stone-900 mt-0.5">{o.total_sites.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-stone-500 flex items-center gap-1">
                        <Activity size={11} /> Fresh
                      </div>
                      <div className="font-semibold text-stone-900 mt-0.5">{minutes}m</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-forest-700 font-medium inline-flex items-center gap-1 group-hover:text-forest-800">
                    {o.available_sites.toLocaleString()} sites open · Browse parks →
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <div className="mt-12 card p-5 text-sm text-stone-600">
        <div className="font-semibold text-stone-900 mb-1">Why three groups?</div>
        Provincial parks are run by Ontario Parks on Camis&apos;s Camis5 platform. Federal parks in Ontario are run by Parks
        Canada on PCRSv3. Each Conservation Authority is independent but most run the same Camis-built GoingToCamp
        product, so the same API surface powers all three.
        <a
          href="https://github.com/braedonsaunders/ontariocamps.app"
          className="text-forest-700 hover:text-forest-800 ml-1"
        >
          Read the spec <ArrowUpRight size={12} className="inline" />
        </a>
      </div>
    </div>
  );
}
