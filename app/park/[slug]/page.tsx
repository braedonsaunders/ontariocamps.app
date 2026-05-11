import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getParkBySlug,
  getOperatorWithStats,
  getCampgroundsForPark,
  getCampMapsForPark,
  getSitesForPark,
  getEquipmentForOperator,
} from "@/lib/data-source";
import { getSiteAvailabilityForPark } from "@/lib/db/queries";
import { timeAgo } from "@/lib/utils";
import { ArrowUpRight, MapPin, Tent } from "lucide-react";
import { AvailabilityCalendar, type CalendarRow } from "@/components/availability-calendar";
import { CampgroundMap } from "@/components/campground-map";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) return { title: "Park not found" };
  return { title: park.name, description: park.description };
}

export default async function ParkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const park = await getParkBySlug(slug);
  if (!park) notFound();

  // Fan out all the per-park scoped queries in parallel. None of these scan
  // the full sites/availability tables — they all filter on park_id first.
  const [operator, cgs, parkCampMaps, allParkSites, operatorEquipment, perNight] = await Promise.all([
    getOperatorWithStats(park.operator_id),
    getCampgroundsForPark(park.id),
    getCampMapsForPark(park.id),
    getSitesForPark(park.id),
    getEquipmentForOperator(park.operator_id),
    getSiteAvailabilityForPark(park.id),
  ]);
  if (!operator) notFound();

  // Per-site availability counts inside the window
  const sitesByCg = new Map<string, typeof allParkSites>();
  for (const s of allParkSites) {
    if (!sitesByCg.has(s.campground_id)) sitesByCg.set(s.campground_id, []);
    sitesByCg.get(s.campground_id)!.push(s);
  }

  // Per-site availability counts inside the window
  const availBySite = new Map<string, { available: number; total: number; latest: string | null }>();
  for (const r of perNight) {
    const acc = availBySite.get(r.site_id) ?? { available: 0, total: 0, latest: null };
    acc.total += 1;
    if (r.status === "available") acc.available += 1;
    if (!acc.latest || r.last_checked_at > acc.latest) acc.latest = r.last_checked_at;
    availBySite.set(r.site_id, acc);
  }

  // Build per-campground summary
  const summaries = cgs.map((cg) => {
    const cgSites = sitesByCg.get(cg.id) ?? [];
    let availableNights = 0;
    let totalNights = 0;
    let latest = 0;
    for (const s of cgSites) {
      const acc = availBySite.get(s.id);
      if (!acc) continue;
      availableNights += acc.available;
      totalNights += acc.total;
      if (acc.latest) {
        const t = new Date(acc.latest).getTime();
        if (t > latest) latest = t;
      }
    }
    return {
      cg,
      site_count: cgSites.length,
      availability_pct: totalNights ? Math.round((availableNights / totalNights) * 100) : 0,
      last_checked_at: latest ? new Date(latest).toISOString() : null,
    };
  });

  const totalSites = summaries.reduce((sum, s) => sum + s.site_count, 0);
  const avgAvailability = Math.round(
    summaries.reduce((sum, s) => sum + s.availability_pct, 0) / Math.max(summaries.length, 1),
  );

  const sitesById = new Map(allParkSites.map((s) => [s.id, s]));
  const calendarRows: CalendarRow[] = (() => {
    const byId = new Map<string, CalendarRow>();
    let latest: string | null = null;
    for (const r of perNight) {
      const site = sitesById.get(r.site_id);
      if (!site) continue;
      if (!byId.has(r.site_id)) {
        byId.set(r.site_id, {
          site: {
            id: site.id,
            name: site.name,
            site_type: site.site_type,
            site_type_label: site.site_type_label ?? null,
            has_electric: site.has_electric,
          },
          nights: {},
        });
      }
      byId.get(r.site_id)!.nights[r.night_date] = r.status;
      if (!latest || r.last_checked_at > latest) latest = r.last_checked_at;
    }
    return Array.from(byId.values()).sort((a, b) => a.site.name.localeCompare(b.site.name, undefined, { numeric: true }));
  })();
  const calendarLastChecked = (() => {
    for (const r of perNight) return r.last_checked_at;
    return null;
  })();

  // Per-site availability summary for the campground map (status of next 14 nights).
  // Built as plain objects so they can cross the server→client boundary.
  const availabilitySummary: Record<
    string,
    { status: "available" | "reserved" | "closed" | "unknown"; nights_available: number; last_checked_at: string | null }
  > = {};
  const bookingUrls: Record<string, string> = {};
  const sep = park.vendor_url.includes("?") ? "&" : "?";
  for (const s of allParkSites) {
    const acc = availBySite.get(s.id);
    if (!acc || acc.total === 0) {
      availabilitySummary[s.id] = { status: "unknown", nights_available: 0, last_checked_at: null };
    } else {
      const status: "available" | "reserved" | "closed" | "unknown" =
        acc.available > 0 ? "available" : "reserved";
      availabilitySummary[s.id] = {
        status,
        nights_available: acc.available,
        last_checked_at: acc.latest,
      };
    }
    bookingUrls[s.id] = `${park.vendor_url}${sep}resourceId=${s.vendor_site_id}&isReserving=true`;
  }

  return (
    <div>
      <section className="relative h-72 sm:h-96 bg-gradient-to-br from-forest-700 to-forest-900 overflow-hidden">
        {park.hero_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={park.hero_image_url}
            alt={park.name}
            className="absolute inset-0 h-full w-full object-cover opacity-75"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-900/85 via-stone-900/30 to-transparent" />
        <div className="relative h-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-6 text-white">
          <div className="flex items-center gap-2 text-sm">
            <span className="chip bg-white/15 ring-1 ring-white/20">{park.region}</span>
            <Link href={`/operator/${operator.id}`} className="chip bg-white/15 ring-1 ring-white/20 hover:bg-white/25">
              {operator.name}
            </Link>
          </div>
          <h1 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight">{park.name}</h1>
          <div className="flex items-center gap-1.5 mt-2 text-white/90 text-sm">
            <MapPin size={14} /> {park.address}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-2">About this park</h2>
            <p className="text-stone-700 leading-relaxed">{park.description}</p>
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight mb-3">Campgrounds</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {summaries.map(({ cg, site_count, availability_pct, last_checked_at }) => (
                <div key={cg.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{cg.name}</div>
                    <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      {availability_pct}% open
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm text-stone-600">
                    <Tent size={12} className="inline mr-1" /> {site_count} sites indexed
                  </div>
                  {last_checked_at && (
                    <div className="mt-2 text-xs text-stone-500">
                      Last checked {timeAgo(last_checked_at)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {parkCampMaps.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xl font-semibold tracking-tight">Campground layout</h2>
                <span className="text-xs text-stone-500">
                  Operator-branded map · click a site for details
                </span>
              </div>
              <CampgroundMap
                campMaps={parkCampMaps}
                sites={allParkSites}
                availabilitySummary={availabilitySummary}
                bookingUrls={bookingUrls}
                operatorName={operator.name}
                equipmentOptions={operatorEquipment}
              />
            </div>
          )}

          <div>
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-xl font-semibold tracking-tight">Availability calendar</h2>
              <span className="text-xs text-stone-500">
                Real per-night status from {operator.name}. Click any green cell to book it.
              </span>
            </div>
            <AvailabilityCalendar
              rows={calendarRows}
              totalSites={allParkSites.length}
              lastCheckedAt={calendarLastChecked}
              vendorSiteIds={Object.fromEntries(allParkSites.map((s) => [s.id, s.vendor_site_id]))}
              vendorUrl={park.vendor_url}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-stone-500 uppercase tracking-wide">At a glance</div>
            <dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-stone-500">Operator</dt>
              <dd>{operator.name}</dd>
              <dt className="text-stone-500">Vendor</dt>
              <dd className="text-stone-700">{operator.vendor}</dd>
              <dt className="text-stone-500">Sites indexed</dt>
              <dd className="font-medium">{totalSites}</dd>
              <dt className="text-stone-500">Campgrounds</dt>
              <dd className="font-medium">{summaries.length}</dd>
              <dt className="text-stone-500">Avg availability</dt>
              <dd className="font-medium">{avgAvailability}%</dd>
              <dt className="text-stone-500">Coordinates</dt>
              <dd className="text-stone-700">{park.location.lat.toFixed(3)}, {park.location.lng.toFixed(3)}</dd>
            </dl>
            <a
              href={park.vendor_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-5 w-full justify-center"
            >
              Book on {operator.name} <ArrowUpRight size={14} />
            </a>
            <Link
              href={`/search?lat=${park.location.lat}&lng=${park.location.lng}&radius_km=40&operators=${operator.id}`}
              className="btn-secondary mt-2 w-full justify-center"
            >
              Search sites in this park
            </Link>
          </div>

          {(() => {
            const eq = operatorEquipment;
            if (eq.length === 0) return null;
            return (
              <div className="card p-5">
                <div className="text-xs text-stone-500 uppercase tracking-wide">Equipment allowed</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {eq.map((e) => (
                    <span key={e.sub_equipment_category_id} className="chip bg-stone-100 text-stone-700">
                      {e.name}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-stone-500 mt-3 leading-relaxed">
                  At the booking step, {operator.name} matches each equipment type against the site you choose.
                  Filter by your equipment to see only compatible sites.
                </p>
              </div>
            );
          })()}

          {/* Site-type breakdown for this park */}
          {(() => {
            const counts = new Map<string, number>();
            for (const s of allParkSites) {
              const k = s.site_type_label ?? s.site_type;
              counts.set(k, (counts.get(k) ?? 0) + 1);
            }
            if (counts.size === 0) return null;
            return (
              <div className="card p-5">
                <div className="text-xs text-stone-500 uppercase tracking-wide">Site types</div>
                <ul className="mt-3 text-sm space-y-1.5">
                  {Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([label, n]) => (
                    <li key={label} className="flex items-baseline justify-between gap-3">
                      <span className="text-stone-700">{label}</span>
                      <span className="font-medium text-stone-900 tabular-nums">{n.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          <div className="card p-5 text-sm text-stone-600 leading-relaxed">
            <div className="font-semibold text-stone-900 mb-1.5">Heads up</div>
            We don&apos;t handle bookings or rates. Click through to {operator.name} to complete your reservation —
            we pre-populate as much of the booking form as the operator allows.
          </div>
        </aside>
      </section>
    </div>
  );
}
