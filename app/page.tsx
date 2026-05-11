import Link from "next/link";
import { HomeSearch } from "@/components/home-search";
import { sql } from "@/lib/db/client";
import { MapPin, Database, Search, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

type Totals = {
  operators: number;
  parks: number;
  sites: number;
  available: number;
};

type FeaturedPark = {
  slug: string;
  name: string;
  description: string;
  region: string;
  hero_image_url: string | null;
};

type OperatorCard = {
  id: string;
  name: string;
  vendor: string;
  total_sites: number;
  available_sites: number;
  last_availability_at: Date | string | null;
};

export default async function HomePage() {
  const client = sql();
  // Three small, indexed queries in parallel. Total round-trip well under 100ms.
  const [totals, featured, operators] = await Promise.all([
    client<Totals[]>`SELECT operators, parks, sites, available FROM analytics_totals`,
    client<FeaturedPark[]>`
      SELECT slug, name, description, region, hero_image_url
        FROM parks
       WHERE hero_image_url IS NOT NULL
       ORDER BY availability_pct DESC, total_sites DESC
       LIMIT 6
    `,
    client<OperatorCard[]>`
      SELECT id, name, vendor, total_sites, available_sites, last_availability_at
        FROM operators ORDER BY total_sites DESC
    `,
  ]);

  const t = totals[0] ?? { operators: 0, parks: 0, sites: 0, available: 0 };

  return (
    <div>
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-forest-800 to-forest-700 text-white">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_30%_20%,_#fff_1px,_transparent_1px),radial-gradient(circle_at_70%_60%,_#fff_1px,_transparent_1px)] [background-size:40px_40px,60px_60px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Live index across {t.operators} operators
            </span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
              Find an available campsite,<br />across every Ontario operator.
            </h1>
            <p className="mt-4 text-lg text-white/85 max-w-2xl">
              Search Ontario Parks, Parks Canada, and Conservation Authorities in one place.
              We index availability in near-real-time and send you to the operator&apos;s site to book.
            </p>
          </div>
          <div className="mt-8">
            <HomeSearch />
          </div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/85">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-emerald-300" />
              {t.sites.toLocaleString()} sites indexed
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-emerald-300" />
              {t.parks} parks across Ontario
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-emerald-300" />
              {t.available.toLocaleString()} bookable nights across the window
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Why ontariocamps.app</h2>
            <p className="text-stone-600 mt-1">The queries the operator sites can&apos;t answer themselves.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: MapPin, title: "Geo radius search", body: "Anywhere within 90 minutes of Burlington, this weekend, with electric." },
            { icon: Calendar, title: "Flexible dates", body: "Any 3 consecutive nights between July 15 and July 30 — we'll find them." },
            { icon: Search, title: "Cross-operator", body: "All available sites for July long weekend across every Ontario operator at once." },
            { icon: Database, title: "Freshness on every result", body: "Every card shows when we last checked. Median freshness < 10 minutes." },
            { icon: MapPin, title: "Equipment-aware", body: "Filter for 32-foot trailers with pull-through, or tent-only walk-ins." },
            { icon: Search, title: "Deep-link to booking", body: "Click through with date + park already populated on the operator's site." },
          ].map((f) => (
            <div key={f.title} className="card p-5">
              <f.icon size={20} className="text-forest-700" />
              <div className="font-semibold mt-3">{f.title}</div>
              <p className="text-sm text-stone-600 mt-1 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Popular parks</h2>
            <p className="text-stone-600 mt-1">Hand-picked starting points across the province.</p>
          </div>
          <Link href="/search" className="text-sm font-medium text-forest-700 hover:text-forest-800">
            See everything →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featured.map((p) => (
            <Link key={p.slug} href={`/park/${p.slug}`} className="card group overflow-hidden transition hover:shadow-md">
              <div className="relative h-40 bg-gradient-to-br from-forest-600 to-forest-800 overflow-hidden">
                {p.hero_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.hero_image_url}
                    alt={p.name}
                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/30 text-6xl font-bold">
                    {p.name.charAt(0)}
                  </div>
                )}
                <span className="absolute top-2 left-2 chip bg-white/95 text-stone-700 ring-1 ring-stone-200">
                  {p.region}
                </span>
              </div>
              <div className="p-4">
                <div className="font-semibold group-hover:text-forest-700 transition-colors">{p.name}</div>
                <p className="text-sm text-stone-600 mt-1 line-clamp-2">{p.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-semibold tracking-tight mb-6">Operator coverage</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {operators.map((o) => {
              const m = o.last_availability_at;
              const ms = m ? (m instanceof Date ? m.getTime() : new Date(String(m)).getTime()) : 0;
              const minutes = ms ? Math.max(0, Math.floor((Date.now() - ms) / 60000)) : 0;
              return (
                <Link
                  key={o.id}
                  href={`/operator/${o.id}`}
                  className="card p-4 flex items-center justify-between hover:ring-forest-300 transition-shadow"
                >
                  <div>
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {o.total_sites.toLocaleString()} sites · {o.vendor}
                    </div>
                  </div>
                  <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    ~{minutes}m fresh
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
