"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Tent, MapPin, ChevronUp } from "lucide-react";

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
          <Link
            href={`/park/${selected.slug}`}
            className="btn-primary mt-4 w-full justify-center text-xs"
          >
            View park
          </Link>
        </div>
      )}
    </>
  );
}
