import Link from "next/link";
import type { Metadata } from "next";
import { HomeSearch } from "@/components/home-search";
import { HomeHeroBackground, type HomeHeroBackgroundId } from "@/components/home-hero-background";
import { sql } from "@/lib/db/client";
import { MapPin, Database, Calendar } from "lucide-react";
import { MotionHero, MotionFadeUp, MotionStagger, MotionStaggerItem } from "@/components/motion";
import { AnimatedNumber } from "@/components/animated-number";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

const homeHeroBackgroundIds: HomeHeroBackgroundId[] = [
  "algonquin-dusk",
  "killarney-dawn",
  "superior-starglow",
  "georgian-bay-noon",
  "muskoka-autumn",
  "bruce-clearwater",
];

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

export default async function HomePage() {
  const client = sql();
  let totals: Totals[] = [];
  let featured: FeaturedPark[] = [];

  try {
    totals = await client<Totals[]>`SELECT operators, parks, sites, available FROM analytics_totals`;
  } catch (error) {
    console.error("Unable to load homepage analytics totals", error);
  }

  try {
    featured = await client<FeaturedPark[]>`
      SELECT p.slug,
             p.name,
             COALESCE(p.ai_description, p.description, 'Explore campsite availability, park details, and booking links for this Ontario campground.') AS description,
             COALESCE(p.region, 'Ontario') AS region,
             COALESCE(p.hero_image_url, o.hero_image_url) AS hero_image_url
        FROM parks p
        JOIN operators o ON o.id = p.operator_id
       ORDER BY
             CASE WHEN p.available_sites > 0 THEN 0 ELSE 1 END,
             p.total_sites DESC,
             p.name
       LIMIT 6
    `;
  } catch (error) {
    console.error("Unable to load homepage popular parks", error);
  }

  const t = totals[0] ?? { operators: 0, parks: 0, sites: 0, available: 0 };
  const heroSceneId =
    homeHeroBackgroundIds[Math.floor(Math.random() * homeHeroBackgroundIds.length)] ?? "algonquin-dusk";

  return (
    <div>
      <section className="relative isolate z-20 bg-forest-950 text-white">
        <HomeHeroBackground sceneId={heroSceneId} rotate />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <MotionHero className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
              Find an available campsite,<br />across every Ontario operator.
            </h1>
          </MotionHero>
          <MotionFadeUp delay={0.15} className="mt-8">
            <HomeSearch />
          </MotionFadeUp>
          <MotionFadeUp delay={0.3} className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/85">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-emerald-300" />
              <AnimatedNumber value={t.sites} /> sites indexed
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-emerald-300" />
              <AnimatedNumber value={t.parks} duration={0.9} /> parks across Ontario
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-emerald-300" />
              <AnimatedNumber value={t.available} duration={1.6} /> bookable nights
            </div>
          </MotionFadeUp>
        </div>
      </section>

      <section className="relative z-0 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <MotionFadeUp whenInView className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Popular parks</h2>
            <p className="text-stone-600 mt-1">Reliable starting points across the province.</p>
          </div>
          <Link href="/search" className="text-sm font-medium text-forest-700 hover:text-forest-800">
            See everything →
          </Link>
        </MotionFadeUp>
        {featured.length > 0 ? (
          <MotionStagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p, index) => {
              const parkSlug = p.slug ?? `featured-${index}`;
              const parkName = String(p.name ?? "Ontario park");
              const parkInitial = parkName.trim().charAt(0) || "O";
              const parkDescription = String(p.description ?? "Explore campsite availability across Ontario.");
              const parkRegion = String(p.region ?? "Ontario");

              return (
                <MotionStaggerItem key={parkSlug}>
                  <Link href={`/park/${parkSlug}`} className="card group block overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="relative h-40 overflow-hidden bg-gradient-to-br from-forest-600 to-forest-800">
                      {p.hero_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.hero_image_url}
                          alt={parkName}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-6xl font-bold text-white/30">
                          {parkInitial}
                        </div>
                      )}
                      <span className="chip absolute left-2 top-2 bg-white/95 text-stone-700 ring-1 ring-stone-200">
                        {parkRegion}
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="font-semibold transition-colors group-hover:text-forest-700">{parkName}</div>
                      <p className="mt-1 line-clamp-2 text-sm text-stone-600">{parkDescription}</p>
                    </div>
                  </Link>
                </MotionStaggerItem>
              );
            })}
          </MotionStagger>
        ) : (
          <div className="card p-6 text-sm text-stone-600">
            Popular parks are temporarily unavailable here. The full parks directory is still ready.
          </div>
        )}
      </section>

    </div>
  );
}
