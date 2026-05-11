import { notFound } from "next/navigation";
import Link from "next/link";
import { getOperatorWithStats, getParksForOperator } from "@/lib/data-source";
import { ArrowUpRight, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

function freshnessMinutes(last: string | null): number {
  if (!last) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(last).getTime()) / 60000));
}

export default async function OperatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [operator, parks] = await Promise.all([
    getOperatorWithStats(id),
    getParksForOperator(id),
  ]);
  if (!operator) notFound();
  const minutes = freshnessMinutes(operator.last_availability_at);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/parks" className="text-xs text-stone-500 hover:text-forest-700">← Parks</Link>
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
          <div className="text-2xl font-semibold mt-1">{operator.total_parks}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-stone-500">Sites indexed</div>
          <div className="text-2xl font-semibold mt-1">{operator.total_sites.toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-stone-500">Available now</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-700">{operator.available_sites.toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-stone-500">Last refresh</div>
          <div className="text-2xl font-semibold mt-1">{minutes}m</div>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Parks</h2>
      <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {parks.map((p) => (
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
              {p.availability_pct > 0 && (
                <span className="absolute top-2 right-2 chip bg-white/95 text-stone-700 ring-1 ring-stone-200">
                  {p.availability_pct}% open
                </span>
              )}
            </div>
            <div className="p-4">
              <div className="font-semibold group-hover:text-forest-700 transition-colors">{p.name}</div>
              <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
                <MapPin size={11} />{p.region} · {p.total_sites.toLocaleString()} site{p.total_sites === 1 ? "" : "s"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
