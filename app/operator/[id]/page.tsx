import { notFound } from "next/navigation";
import Link from "next/link";
import {
  operatorById as fetchOperatorById,
  fetchParks,
  campgroundsByPark as fetchCampgroundsByPark,
  sitesByCampground as fetchSitesByCampground,
} from "@/lib/data-source";
import { operatorHealth } from "@/lib/search";
import { ArrowUpRight, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OperatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [opMap, ops, allParks, cgsByPark, sitesByCg] = await Promise.all([
    fetchOperatorById(),
    operatorHealth(),
    fetchParks(),
    fetchCampgroundsByPark(),
    fetchSitesByCampground(),
  ]);
  const operator = opMap.get(id);
  if (!operator) notFound();
  const health = ops.find((h) => h.operator.id === id)!;
  const operatorParks = allParks.filter((p) => p.operator_id === id);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/" className="text-xs text-stone-500 hover:text-forest-700">← Home</Link>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">{operator.name}</h1>
          <p className="text-stone-600 mt-1">
            Vendor: <span className="font-mono text-stone-700">{operator.vendor}</span> ·{" "}
            <a href={operator.base_url} target="_blank" rel="noopener noreferrer" className="text-forest-700 hover:underline">
              {operator.base_url.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
        <a href={operator.booking_url} target="_blank" rel="noopener noreferrer" className="btn-primary">
          Visit operator <ArrowUpRight size={14} />
        </a>
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-stone-500">Parks indexed</div>
          <div className="text-2xl font-semibold mt-1">{operatorParks.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-stone-500">Sites indexed</div>
          <div className="text-2xl font-semibold mt-1">{health.sites_indexed}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-stone-500">Median freshness</div>
          <div className="text-2xl font-semibold mt-1">{health.median_freshness_minutes}m</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-stone-500">Status</div>
          <div className="text-2xl font-semibold mt-1 inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Active
          </div>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Parks</h2>
      <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {operatorParks.map((p) => {
          const cgs = cgsByPark.get(p.id) ?? [];
          const siteCount = cgs.reduce((sum, c) => sum + (sitesByCg.get(c.id)?.length ?? 0), 0);
          return (
            <Link
              key={p.id}
              href={`/park/${p.slug}`}
              className="card overflow-hidden group transition hover:shadow-md"
            >
              <div className="relative h-32 bg-gradient-to-br from-forest-600 to-forest-800 overflow-hidden">
                {p.hero_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.hero_image_url}
                    alt={p.name}
                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/30 text-4xl font-bold">
                    {p.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="font-semibold group-hover:text-forest-700 transition-colors">{p.name}</div>
                <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
                  <MapPin size={11} />{p.region} · {siteCount.toLocaleString()} site{siteCount === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
