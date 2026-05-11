"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl, { type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Tent, MapPin, ChevronUp } from "lucide-react";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

const ONTARIO_BOUNDS: LngLatBoundsLike = [
  [-95.5, 41.5], // SW
  [-74.0, 56.5], // NE
];

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
      bounds: ONTARIO_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      map.addSource("parks", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 8,
        clusterProperties: {
          avail_sum: ["+", ["get", "available_sites"]],
          total_sum: ["+", ["get", "total_sites"]],
        },
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
      map.addLayer({
        id: "park-points-hit",
        type: "circle",
        source: "parks",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": 16, "circle-color": "rgba(0,0,0,0)" },
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

      // Tap a park → show details card
      map.on("click", "park-points-hit", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Park;
        setSelected({
          slug: p.slug,
          name: p.name,
          operator: p.operator,
          operator_id: p.operator_id,
          region: p.region,
          total_sites: Number(p.total_sites),
          available_sites: Number(p.available_sites),
          availability_pct: Number(p.availability_pct),
          lat: (f.geometry as unknown as { coordinates: [number, number] }).coordinates[1],
          lng: (f.geometry as unknown as { coordinates: [number, number] }).coordinates[0],
        });
      });

      map.on("mouseenter", "park-points-hit", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "park-points-hit", () => {
        map.getCanvas().style.cursor = "";
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
      <div ref={containerRef} className="absolute inset-0" />
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
              onClick={() => setSelected(null)}
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
