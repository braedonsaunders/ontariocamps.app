"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ArrowUpRight, Calendar, ChevronLeft, ChevronUp, Loader2, MapPin, Tent, X } from "lucide-react";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const BARRIE_CENTER: [number, number] = [-79.6903, 44.3894];
const INITIAL_ZOOM = 6.55;

export type Park = {
  slug: string;
  name: string;
  operator: string;
  operator_id: string;
  region: string;
  lat: number;
  lng: number;
  total_sites: number;
  available_sites: number;
  availability_pct: number;
};

type ParkDetail = {
  park: {
    slug: string;
    name: string;
    description: string;
    region: string;
    address: string;
    hero_image_url?: string | null;
    vendor_url: string;
  };
  operator?: {
    id: string;
    name: string;
  };
  campgrounds: Array<{
    campground: {
      id: string;
      name: string;
    };
    site_count: number;
    availability_pct: number;
    last_checked_at: string | null;
  }>;
};

function colorForAvailability(pct: number): string {
  if (pct >= 50) return "#10b981";
  if (pct >= 25) return "#f59e0b";
  if (pct >= 5) return "#f97316";
  return "#ef4444";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
  );
}

export function OntarioMap({ parks }: { parks: Park[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selected, setSelected] = useState<Park | null>(null);
  const [flyoutPark, setFlyoutPark] = useState<Park | null>(null);
  const [parkDetail, setParkDetail] = useState<ParkDetail | null>(null);
  const [parkDetailLoading, setParkDetailLoading] = useState(false);

  useEffect(() => {
    if (!flyoutPark) {
      setParkDetail(null);
      setParkDetailLoading(false);
      return;
    }
    const ac = new AbortController();
    setParkDetail(null);
    setParkDetailLoading(true);
    fetch(`/api/park/${flyoutPark.slug}`, { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load park"))))
      .then((data: ParkDetail) => setParkDetail(data))
      .catch((err) => {
        if (err.name !== "AbortError") setParkDetail(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setParkDetailLoading(false);
      });
    return () => ac.abort();
  }, [flyoutPark]);

  const features = useMemo(
    () =>
      parks.map((p) => ({
        type: "Feature" as const,
        properties: {
          slug: p.slug,
          name: p.name,
          operator: p.operator,
          operator_id: p.operator_id,
          region: p.region,
          total_sites: p.total_sites,
          available_sites: p.available_sites,
          availability_pct: p.availability_pct,
          color: colorForAvailability(p.availability_pct),
        },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    [parks],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: BARRIE_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    // Force a resize after the layout settles. If the container had 0 height
    // when init ran (flex layout still resolving inside a motion.div), this
    // catches it once the browser paints.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    // Also trigger once after the next frame, which fixes the common case
    // where width/height resolve right after first paint.
    requestAnimationFrame(() => map.resize());

    map.on("load", () => {
      map.addSource("parks", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        // Looser clustering: smaller radius (=more individual pins survive at
        // any given zoom) and a lower max zoom (=clusters break up sooner as
        // you zoom in). The earlier 45/8 over-clumped the GTA area.
        clusterRadius: 22,
        clusterMaxZoom: 6,
        clusterProperties: {
          avail_sum: ["+", ["get", "available_sites"]],
          total_sum: ["+", ["get", "total_sites"]],
        },
      });
      // Source for the currently-selected park (empty until click). A second
      // ring layer paints on top of park-points to highlight it.
      map.addSource("selected-park", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "park-clusters",
        type: "circle",
        source: "parks",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["/", ["get", "avail_sum"], ["max", ["get", "total_sum"], 1]],
            "#ef4444",
            0.1,
            "#f97316",
            0.3,
            "#f59e0b",
            0.5,
            "#10b981",
          ],
          "circle-radius": ["step", ["get", "point_count"], 16, 5, 22, 25, 30, 75, 38],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity": 0.92,
        },
      });
      map.addLayer({
        id: "park-cluster-count",
        type: "symbol",
        source: "parks",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "park-points",
        type: "circle",
        source: "parks",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 8, 14, 12],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.95,
        },
      });
      // Park-name labels next to each individual (non-clustered) pin. We
      // hide them at low zooms where they'd be a crammed mess, then fade
      // them in at zoom > 7 (right after clusters break apart). Halo so the
      // text reads over both light and dark basemap.
      map.addLayer({
        id: "park-points-label",
        type: "symbol",
        source: "parks",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 10, 12, 14, 13],
          "text-offset": [0, 1.05],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-optional": true,
          "text-padding": 4,
        },
        paint: {
          "text-color": "#1c1917",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            0,
            6.4,
            1,
          ],
        },
      });
      map.addLayer({
        id: "park-points-hit",
        type: "circle",
        source: "parks",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": 16, "circle-color": "rgba(0,0,0,0)" },
      });
      // Selected-park highlight: a thick semi-transparent halo plus a larger,
      // solid disc on top, so the clicked pin reads as obviously distinct.
      map.addLayer({
        id: "park-points-selected-halo",
        type: "circle",
        source: "selected-park",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 14, 10, 22, 14, 30],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.25,
        },
      });
      map.addLayer({
        id: "park-points-selected",
        type: "circle",
        source: "selected-park",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 12, 14, 16],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#1c1917",
          "circle-stroke-width": 2.5,
          "circle-opacity": 1,
        },
      });

      // Tap a cluster → zoom in
      map.on("click", "park-clusters", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const clusterId = f.properties?.cluster_id;
        const source = map.getSource("parks") as maplibregl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({ center: (f.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom });
        });
      });

      // Tap a park → show details card and outline the pin.
      map.on("click", "park-points-hit", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Park;
        const [lng, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
        const park: Park = {
          slug: p.slug,
          name: p.name,
          operator: p.operator,
          operator_id: p.operator_id,
          region: p.region,
          total_sites: Number(p.total_sites),
          available_sites: Number(p.available_sites),
          availability_pct: Number(p.availability_pct),
          lat,
          lng,
        };
        setSelected(park);
        const sel = map.getSource("selected-park") as maplibregl.GeoJSONSource | undefined;
        sel?.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { color: colorForAvailability(park.availability_pct) },
              geometry: { type: "Point", coordinates: [lng, lat] },
            },
          ],
        });
      });

      // Hover tooltip on park points — shows name, operator, available/total.
      const tooltip = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
        className: "park-hover-popup",
      });
      map.on("mouseenter", "park-points-hit", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Park;
        const [lng, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
        const pct = Number(p.availability_pct);
        const open = Number(p.available_sites);
        const total = Number(p.total_sites);
        // Build a small HTML body for the popup — kept terse since it appears
        // on hover and shouldn't shout.
        const html = `
          <div class="font-semibold text-stone-900 leading-tight text-sm mb-1">${escapeHtml(p.name)}</div>
          <div class="text-[11px] text-stone-500 leading-tight mb-1.5">${escapeHtml(p.operator)} · ${escapeHtml(p.region || "")}</div>
          <div class="flex items-center gap-2 text-[11px]">
            <span class="inline-flex items-center gap-1">
              <span class="h-2 w-2 rounded-full" style="background:${colorForAvailability(pct)}"></span>
              <span class="font-semibold text-stone-900">${open.toLocaleString()}</span>
              <span class="text-stone-500">/${total.toLocaleString()} open · ${pct}%</span>
            </span>
          </div>
        `;
        tooltip.setLngLat([lng, lat]).setHTML(html).addTo(map);
      });
      map.on("mouseleave", "park-points-hit", () => {
        map.getCanvas().style.cursor = "";
        tooltip.remove();
      });
      map.on("mouseenter", "park-clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "park-clusters", () => {
        map.getCanvas().style.cursor = "";
      });

      mapRef.current = map;
      // Initial source push (features may have been computed before "load" finished)
      const src = map.getSource("parks") as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: "FeatureCollection", features });
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync data on prop changes after init
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource("parks") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData({ type: "FeatureCollection", features });
  }, [features]);

  return (
    <>
      {/* maplibre adds `.maplibregl-map { position: relative; overflow: hidden }`
       *  to whatever container we hand it. That overrides Tailwind's `absolute`
       *  (same specificity, later in cascade), so `inset-0` becomes a no-op and
       *  the div collapses to 0 height — canvas renders 300 px then gets clipped.
       *  Inline width/height beats the class entirely. */}
      <div
        ref={containerRef}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />
      {selected && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-96 card shadow-xl p-4 z-10">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/park/${selected.slug}`}
                className="text-base font-semibold hover:text-forest-700 transition-colors line-clamp-1"
              >
                {selected.name}
              </Link>
              <div className="text-xs text-stone-500 mt-0.5">
                <Link href={`/operator/${selected.operator_id}`} className="hover:text-stone-900">
                  {selected.operator}
                </Link>
                {" · "}
                {selected.region}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                const sel = mapRef.current?.getSource("selected-park") as maplibregl.GeoJSONSource | undefined;
                sel?.setData({ type: "FeatureCollection", features: [] });
              }}
              className="text-stone-400 hover:text-stone-700 transition-colors shrink-0"
              aria-label="Close"
            >
              <ChevronUp size={16} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-stone-500 flex items-center gap-1"><Tent size={10} /> Sites</div>
              <div className="font-semibold tabular-nums">{selected.total_sites.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-stone-500">Open</div>
              <div
                className="font-semibold tabular-nums"
                style={{ color: colorForAvailability(selected.availability_pct) }}
              >
                {selected.available_sites.toLocaleString()} · {selected.availability_pct}%
              </div>
            </div>
            <div>
              <div className="text-stone-500 flex items-center gap-1"><MapPin size={10} /> Coords</div>
              <div className="font-semibold tabular-nums">{selected.lat.toFixed(2)}, {selected.lng.toFixed(2)}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFlyoutPark(selected)}
            className="btn-primary mt-4 w-full justify-center text-xs"
          >
            View park
          </button>
        </div>
      )}
      <MapParkFlyout
        park={flyoutPark}
        detail={parkDetail}
        loading={parkDetailLoading}
        onClose={() => setFlyoutPark(null)}
      />
    </>
  );
}

function MapParkFlyout({
  park,
  detail,
  loading,
  onClose,
}: {
  park: Park | null;
  detail: ParkDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!park) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [park, onClose]);

  const displayPark = detail?.park;
  const operatorName = detail?.operator?.name ?? park?.operator;
  const sortedCampgrounds = [...(detail?.campgrounds ?? [])]
    .sort((a, b) => b.site_count - a.site_count)
    .slice(0, 8);

  return (
    <AnimatePresence>
      {park && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Close park details"
            className="absolute inset-0 bg-stone-950/35 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`${park.name} details`}
            className="absolute inset-y-0 right-0 flex w-full max-w-[720px] flex-col bg-stone-50 shadow-2xl ring-1 ring-stone-950/10"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 330, damping: 34 }}
          >
            <header className="relative shrink-0 overflow-hidden bg-forest-900 text-white">
              {displayPark?.hero_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayPark.hero_image_url}
                  alt={park.name}
                  className="absolute inset-0 h-full w-full object-cover opacity-65"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/55 to-stone-950/15" />
              <div className="relative p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/20 transition-colors hover:bg-white/25"
                    aria-label="Back to map"
                    title="Back to map"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/80">
                      <span className="chip bg-white/15 text-white ring-1 ring-white/20">{displayPark?.region || park.region}</span>
                      {operatorName && (
                        <span className="chip bg-white/15 text-white ring-1 ring-white/20">{operatorName}</span>
                      )}
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{park.name}</h2>
                    {(displayPark?.address || park.region) && (
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
                        <MapPin size={14} /> {displayPark?.address || park.region}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {loading ? (
                <div className="flex min-h-64 items-center justify-center text-sm text-stone-500">
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Loading park details
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                      <div className="flex items-center gap-1 text-xs font-medium uppercase text-stone-500">
                        <Tent size={12} /> Sites
                      </div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums text-stone-950">
                        {park.total_sites.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                      <div className="text-xs font-medium uppercase text-stone-500">Open</div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: colorForAvailability(park.availability_pct) }}>
                        {park.availability_pct}%
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                      <div className="flex items-center gap-1 text-xs font-medium uppercase text-stone-500">
                        <Calendar size={12} /> Sections
                      </div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums text-stone-950">
                        {detail?.campgrounds.length ?? "--"}
                      </div>
                    </div>
                  </div>

                  {displayPark?.description && (
                    <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                      <h3 className="text-sm font-semibold text-stone-950">About</h3>
                      <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-stone-700">{displayPark.description}</p>
                    </section>
                  )}

                  <section className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-stone-950">Campground Sections</h3>
                      {detail?.campgrounds.length ? (
                        <span className="text-xs text-stone-500">{detail.campgrounds.length} total</span>
                      ) : null}
                    </div>
                    {sortedCampgrounds.length > 0 ? (
                      <div className="divide-y divide-stone-100">
                        {sortedCampgrounds.map((cg) => (
                          <div key={cg.campground.id} className="flex items-center gap-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-stone-900">{cg.campground.name}</div>
                              <div className="mt-0.5 text-xs text-stone-500">{cg.site_count.toLocaleString()} sites</div>
                            </div>
                            <span
                              className={`chip shrink-0 ring-1 ${
                                cg.availability_pct >= 50
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                  : cg.availability_pct >= 10
                                  ? "bg-amber-50 text-amber-700 ring-amber-200"
                                  : "bg-red-50 text-red-700 ring-red-200"
                              }`}
                            >
                              {cg.availability_pct}% open
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-sm text-stone-500">
                        Section details are not available yet.
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>

            <footer className="shrink-0 border-t border-stone-200 bg-white px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                {displayPark?.vendor_url && (
                  <a
                    href={displayPark.vendor_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex-1 justify-center"
                  >
                    Book with {operatorName ?? "operator"} <ArrowUpRight size={14} />
                  </a>
                )}
                <Link href={`/park/${park.slug}`} className="btn-primary flex-1 justify-center">
                  Full park page
                </Link>
              </div>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
