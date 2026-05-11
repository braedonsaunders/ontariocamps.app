"use client";
import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

const ONTARIO_BOUNDS: LngLatBoundsLike = [
  [-95.5, 41.5], // SW
  [-74.0, 56.5], // NE
];

export type ParkSummary = {
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

type Props = {
  /** Optional anchor (search centre). When present, a marker + radius ring are
   *  drawn. The map auto-fits to anchor + radius. */
  anchor: { lat: number; lng: number } | null;
  radiusKm: number;
  /** All parks in the index, with current availability rollup. The map shows
   *  every pin always, colored by availability %. */
  allParks: ParkSummary[];
  /** Slugs of parks that currently match the user's search. These are drawn
   *  brighter; the rest are drawn dim. Optional — when null, every pin is at
   *  full opacity. */
  matchedSlugs: Set<string> | null;
};

/** Green-amber-red colour for an availability percentage. Used for park pins. */
function availabilityColor(pct: number): string {
  // 0% available  → red
  // 25% available → orange
  // 50% available → amber
  // 100% available→ emerald
  if (pct >= 50) return "#10b981";   // emerald-500
  if (pct >= 25) return "#f59e0b";   // amber-500
  if (pct >= 5)  return "#f97316";   // orange-500
  return "#ef4444";                  // red-500
}

export function ParkMap({ anchor, radiusKm, allParks, matchedSlugs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Features for the parks GeoJSON source — built once per props change.
  const features = useMemo(() => {
    return allParks.map((p) => ({
      type: "Feature" as const,
      properties: {
        slug: p.slug,
        name: p.name,
        operator: p.operator,
        operator_id: p.operator_id,
        region: p.region,
        available_sites: p.available_sites,
        total_sites: p.total_sites,
        availability_pct: p.availability_pct,
        color: availabilityColor(p.availability_pct),
        matched: matchedSlugs ? (matchedSlugs.has(p.slug) ? 1 : 0) : 1,
      },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    }));
  }, [allParks, matchedSlugs]);

  // One-time init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds: ONTARIO_BOUNDS,
      fitBoundsOptions: { padding: 30 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      // Anchor (search centre)
      map.addSource("anchor", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("anchor-radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "anchor-radius-fill",
        type: "fill",
        source: "anchor-radius",
        paint: { "fill-color": "#5a8849", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "anchor-radius-line",
        type: "line",
        source: "anchor-radius",
        paint: { "line-color": "#37562e", "line-width": 1.5, "line-dasharray": [3, 2], "line-opacity": 0.55 },
      });
      map.addLayer({
        id: "anchor-pin",
        type: "circle",
        source: "anchor",
        paint: {
          "circle-radius": 6,
          "circle-color": "#37562e",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      // Parks: clustered points. Cluster sums each park's available_sites so
      // the cluster label reflects "how many bookable sites are inside this
      // cluster", not just "how many parks".
      map.addSource("parks", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 38,
        clusterMaxZoom: 9,
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
            "case",
            [">", ["get", "avail_sum"], 50], "#10b981",
            [">", ["get", "avail_sum"], 10], "#f59e0b",
            [">", ["get", "avail_sum"], 0],  "#f97316",
            "#9ca3af",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16, 5,
            22, 20,
            28,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
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
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });

      // Individual park pins. Larger if the park has any availability.
      map.addLayer({
        id: "park-points",
        type: "circle",
        source: "parks",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "total_sites"],
            1, 6,
            500, 12,
            5000, 18,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity": ["case", ["==", ["get", "matched"], 1], 1, 0.25],
          "circle-stroke-opacity": ["case", ["==", ["get", "matched"], 1], 1, 0.4],
        },
      });

      // Cluster click → zoom in
      map.on("click", "park-clusters", async (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const src = map.getSource("parks") as GeoJSONSource;
        const clusterId = feature.properties?.cluster_id as number;
        const zoom = await src.getClusterExpansionZoom(clusterId);
        const geom = feature.geometry as GeoJSON.Point;
        map.easeTo({ center: geom.coordinates as [number, number], zoom });
      });

      // Park-pin popup on hover
      const showPopup = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as Record<string, string | number>;
        const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        if (popupRef.current) popupRef.current.remove();
        const available = Number(props.available_sites);
        const total = Number(props.total_sites);
        const pct = Number(props.availability_pct);
        popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 14, className: "ocp-popup" })
          .setLngLat(coords)
          .setHTML(
            `<a href="/park/${props.slug}" style="display:block; min-width:200px; text-decoration:none; color:#1c1917;">
               <div style="font-weight:600; font-size:13px; line-height:1.2;">${escapeHtml(String(props.name))}</div>
               <div style="font-size:11px; color:#57534e; margin-top:2px;">${escapeHtml(String(props.operator))} · ${escapeHtml(String(props.region))}</div>
               <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
                 <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${availabilityColor(pct)};"></span>
                 <span style="font-size:11px; color:#1c1917; font-weight:500;">${available} of ${total} sites open · ${pct}%</span>
               </div>
               <div style="font-size:10px; color:#78716c; margin-top:6px;">Click to view park →</div>
             </a>`,
          )
          .addTo(map);
      };
      map.on("mouseenter", "park-points", showPopup);
      map.on("mouseleave", "park-points", () => {
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
      });
      map.on("click", "park-points", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const slug = feature.properties?.slug as string;
        if (slug) window.location.href = `/park/${slug}`;
      });
      for (const layer of ["park-clusters", "park-points"] as const) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update parks source
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("parks") as GeoJSONSource | undefined;
      if (!src) return;
      src.setData({ type: "FeatureCollection", features });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [features]);

  // Update anchor and radius circle + auto-fit when search anchor changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const anchorSrc = map.getSource("anchor") as GeoJSONSource | undefined;
      const radiusSrc = map.getSource("anchor-radius") as GeoJSONSource | undefined;
      if (!anchorSrc || !radiusSrc) return;
      if (!anchor) {
        anchorSrc.setData({ type: "FeatureCollection", features: [] });
        radiusSrc.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      anchorSrc.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [anchor.lng, anchor.lat] } }],
      });
      radiusSrc.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [circlePolygon(anchor.lng, anchor.lat, radiusKm)] },
          },
        ],
      });
      // Pan/zoom so the search circle fits within the viewport
      const padding = 60;
      const radiusDeg = radiusKm / 111;
      map.fitBounds(
        [
          [anchor.lng - radiusDeg * 1.5, anchor.lat - radiusDeg],
          [anchor.lng + radiusDeg * 1.5, anchor.lat + radiusDeg],
        ],
        { padding, duration: 400, maxZoom: 9 },
      );
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [anchor, radiusKm]);

  return (
    <div className="relative h-full w-full rounded-xl overflow-hidden ring-1 ring-stone-200">
      {/* Inline style — maplibre's `.maplibregl-map` overrides `position: absolute`
       *  from Tailwind, which kills `inset-0`. See OntarioMap for the full note. */}
      <div ref={containerRef} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
      {/* Legend overlay */}
      <div className="absolute top-3 left-3 bg-white/95 ring-1 ring-stone-200 rounded-md px-2.5 py-2 text-[11px] shadow-sm">
        <div className="text-stone-500 mb-1.5 font-medium uppercase tracking-wide text-[10px]">Availability now</div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#10b981" }} /> 50%+ open</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#f59e0b" }} /> 25–49% open</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#f97316" }} /> 5–24% open</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#ef4444" }} /> &lt; 5% open</span>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function circlePolygon(lng: number, lat: number, radiusKm: number, steps = 64): [number, number][] {
  const R = 6371;
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;
    const d = radiusKm / R;
    const newLat = Math.asin(Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearing));
    const newLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(newLat),
      );
    out.push([(newLng * 180) / Math.PI, (newLat * 180) / Math.PI]);
  }
  return out;
}
