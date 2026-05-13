"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { displayOperatorName } from "@/lib/display";
import { Tent, MapPin, ChevronUp, Circle, Diamond, Square, Triangle, type LucideIcon } from "lucide-react";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const BARRIE_CENTER: [number, number] = [-79.6903, 44.3894];
const INITIAL_ZOOM = 6.55;
const BASE_CATEGORY_ORDER = ["provincial", "conservation", "federal"] as const;
const CATEGORY_ORDER = [...BASE_CATEGORY_ORDER, "private"] as const;

export type Park = {
  slug: string;
  name: string;
  description: string | null;
  hero_image_url: string | null;
  operator: string;
  operator_id: string;
  operator_vendor?: string;
  region: string;
  lat: number;
  lng: number;
  total_sites: number;
  available_sites: number;
  availability_pct: number;
  match_count?: number;
  distance_km?: number;
};

type ParkCategory = (typeof CATEGORY_ORDER)[number];

type SelectedPark = Park & {
  category: ParkCategory;
};

type OntarioMapProps = {
  parks: Park[];
  anchor?: { lat: number; lng: number } | null;
  radiusKm?: number;
  matchedSlugs?: Set<string> | null;
  mode?: "explore" | "search";
  resultLabel?: string;
  showCategoryFilters?: boolean;
  showCompactCategoryLegend?: boolean;
  showPrivateFilter?: boolean;
  fitToMarkers?: boolean;
  focusedSlug?: string | null;
  focusZoom?: number;
  onParkSelect?: (slug: string) => void;
};

const CATEGORY_META: Record<ParkCategory, {
  label: string;
  shortLabel: string;
  glyph: string;
  icon: LucideIcon;
}> = {
  provincial: {
    label: "Provincial parks",
    shortLabel: "Provincial",
    glyph: "●",
    icon: Circle,
  },
  conservation: {
    label: "Conservation areas",
    shortLabel: "Conservation",
    glyph: "◆",
    icon: Diamond,
  },
  federal: {
    label: "Federal parks",
    shortLabel: "Federal",
    glyph: "■",
    icon: Square,
  },
  private: {
    label: "Private campgrounds",
    shortLabel: "Private",
    glyph: "▲",
    icon: Triangle,
  },
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

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const trimmed = value.slice(0, maxLength - 1).trimEnd();
  return `${trimmed.replace(/[.,;:!?-]+$/, "")}…`;
}

function safeImageUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function parkPreviewDescription(park: Pick<Park, "description" | "operator">): string {
  const description = normalizeText(park.description);
  if (description) return truncateText(description, 220);
  return `Browse campsite availability, site details, and booking links from ${displayOperatorName(park.operator)}.`;
}

function categoryForPark(park: Pick<Park, "operator_id" | "operator_vendor">): ParkCategory {
  if (park.operator_id === "ontario_parks") return "provincial";
  if (park.operator_id === "st_lawrence_parks") return "provincial";
  if (park.operator_id === "parks_canada") return "federal";
  if (park.operator_id.includes("_private") || park.operator_vendor === "campspot" || park.operator_vendor === "camplife") return "private";
  return "conservation";
}

export function OntarioMap({
  parks,
  anchor = null,
  radiusKm = 0,
  matchedSlugs = null,
  mode = "explore",
  resultLabel = "matches",
  showCategoryFilters = true,
  showCompactCategoryLegend = false,
  showPrivateFilter = false,
  fitToMarkers = false,
  focusedSlug = null,
  focusZoom = 9,
  onParkSelect,
}: OntarioMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedRef = useRef<SelectedPark | null>(null);
  const onParkSelectRef = useRef(onParkSelect);
  const [selected, setSelected] = useState<SelectedPark | null>(null);
  const [enabledCategories, setEnabledCategories] = useState<Record<ParkCategory, boolean>>({
    provincial: true,
    conservation: true,
    federal: true,
    private: true,
  });

  const filterCategories = showPrivateFilter ? CATEGORY_ORDER : BASE_CATEGORY_ORDER;

  const categoryCounts = useMemo(() => {
    const counts: Record<ParkCategory, number> = { provincial: 0, conservation: 0, federal: 0, private: 0 };
    for (const park of parks) counts[categoryForPark(park)] += 1;
    return counts;
  }, [parks]);

  const compactLegendCategories = CATEGORY_ORDER.filter((category) => categoryCounts[category] > 0);

  const filteredParks = useMemo(
    () => parks.filter((park) => enabledCategories[categoryForPark(park)]),
    [enabledCategories, parks],
  );

  const features = useMemo(
    () =>
      filteredParks.map((p) => {
        const category = categoryForPark(p);
        const meta = CATEGORY_META[category];
        const description = parkPreviewDescription(p);
        return {
          type: "Feature" as const,
          properties: {
            slug: p.slug,
            name: p.name,
            description,
            hero_image_url: safeImageUrl(p.hero_image_url),
            operator: displayOperatorName(p.operator),
            operator_id: p.operator_id,
            operator_vendor: p.operator_vendor ?? null,
            region: p.region,
            total_sites: p.total_sites,
            available_sites: p.available_sites,
            availability_pct: p.availability_pct,
            match_count: p.match_count ?? p.available_sites,
            distance_km: p.distance_km ?? null,
            color: colorForAvailability(p.availability_pct),
            category,
            category_label: meta.shortLabel,
            category_glyph: meta.glyph,
            matched: matchedSlugs ? (matchedSlugs.has(p.slug) ? 1 : 0) : 1,
          },
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        };
      }),
    [filteredParks, matchedSlugs],
  );

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    onParkSelectRef.current = onParkSelect;
  }, [onParkSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: BARRIE_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
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
        type: "symbol",
        source: "parks",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "category_glyph"],
          "text-font": ["Noto Sans Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            ["case", ["==", ["get", "category"], "provincial"], 24, 13],
            10,
            ["case", ["==", ["get", "category"], "provincial"], 34, 18],
            14,
            ["case", ["==", ["get", "category"], "provincial"], 44, 24],
          ],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": ["get", "color"],
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
          "text-opacity": ["case", ["==", ["get", "matched"], 1], 1, 0.3],
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
            ["case", ["==", ["get", "matched"], 1], 1, 0.3],
          ],
        },
      });
      map.addLayer({
        id: "park-points-hit",
        type: "circle",
        source: "parks",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": 20, "circle-color": "rgba(0,0,0,0)" },
      });
      // Selected parks use the same shape-only marker, just larger with a dark
      // halo. Availability remains the marker colour; there is no circular base.
      map.addLayer({
        id: "park-points-selected-category",
        type: "symbol",
        source: "selected-park",
        layout: {
          "text-field": ["get", "category_glyph"],
          "text-font": ["Noto Sans Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            ["case", ["==", ["get", "category"], "provincial"], 30, 16],
            10,
            ["case", ["==", ["get", "category"], "provincial"], 40, 22],
            14,
            ["case", ["==", ["get", "category"], "provincial"], 50, 28],
          ],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": ["get", "color"],
          "text-halo-color": "#1c1917",
          "text-halo-width": 1.2,
        },
      });

      const tooltip = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
        className: "park-hover-popup",
      });
      const clearSelectedPark = () => {
        tooltip.remove();
        setSelected(null);
        const sel = map.getSource("selected-park") as maplibregl.GeoJSONSource | undefined;
        sel?.setData({ type: "FeatureCollection", features: [] });
      };

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
        tooltip.remove();
        const p = f.properties as Park;
        const [lng, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
        const category = categoryForPark({
          operator_id: String(p.operator_id),
          operator_vendor: typeof p.operator_vendor === "string" ? p.operator_vendor : undefined,
        });
        const park: SelectedPark = {
          slug: p.slug,
          name: p.name,
          description: String(p.description ?? ""),
          hero_image_url: safeImageUrl(String(p.hero_image_url ?? "")),
          operator: p.operator,
          operator_id: p.operator_id,
          region: p.region,
          total_sites: Number(p.total_sites),
          available_sites: Number(p.available_sites),
          availability_pct: Number(p.availability_pct),
          lat,
          lng,
          category,
        };
        setSelected(park);
        onParkSelectRef.current?.(park.slug);
        const sel = map.getSource("selected-park") as maplibregl.GeoJSONSource | undefined;
        sel?.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                color: colorForAvailability(park.availability_pct),
                category_glyph: CATEGORY_META[park.category].glyph,
                category: park.category,
              },
              geometry: { type: "Point", coordinates: [lng, lat] },
            },
          ],
        });
      });

      // Tap empty map space → dismiss the corner park card.
      map.on("click", (e) => {
        const clickedMarker = map.queryRenderedFeatures(e.point, {
          layers: ["park-points-hit", "park-clusters"],
        });
        if (clickedMarker.length > 0) return;
        clearSelectedPark();
      });

      // Hover tooltip on park points — shows photo, description, operator, and availability.
      map.on("mouseenter", "park-points-hit", (e) => {
        if (selectedRef.current) return;
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Park;
        const [lng, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
        const pct = Number(p.availability_pct);
        const open = Number(p.available_sites);
        const total = Number(p.total_sites);
        const category = categoryForPark({
          operator_id: String(p.operator_id),
          operator_vendor: typeof p.operator_vendor === "string" ? p.operator_vendor : undefined,
        });
        const meta = CATEGORY_META[category];
        const imageUrl = safeImageUrl(String(p.hero_image_url ?? ""));
        const description = parkPreviewDescription({
          description: String(p.description ?? ""),
          operator: String(p.operator ?? "this operator"),
        });
        const html = `
          <div class="park-hover-card">
            ${
              imageUrl
                ? `<img class="park-hover-card__image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(String(p.name))}" loading="lazy" decoding="async" />`
                : `<div class="park-hover-card__image park-hover-card__image--fallback"></div>`
            }
            <div class="park-hover-card__body">
              <div class="park-hover-card__eyebrow">
                <span class="park-hover-card__type">${escapeHtml(meta.glyph)} ${escapeHtml(meta.shortLabel)}</span>
                <span>${escapeHtml(String(p.operator))}</span>
              </div>
              <div class="park-hover-card__title">${escapeHtml(String(p.name))}</div>
              <div class="park-hover-card__region">${escapeHtml(String(p.region || "Ontario"))}</div>
              <p class="park-hover-card__description">${escapeHtml(description)}</p>
              <div class="park-hover-card__stats">
                <span>
                  <i style="background:${colorForAvailability(pct)}"></i>
                  <strong>${open.toLocaleString()}</strong>/${total.toLocaleString()} open
                </span>
                <span>${pct}% availability</span>
              </div>
            </div>
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitToMarkers || focusedSlug || features.length === 0) return;
    const apply = () => {
      const coordinates = features.map((feature) => feature.geometry.coordinates as [number, number]);
      if (coordinates.length === 0) return;
      const bounds = coordinates.reduce(
        (next, coordinate) => next.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
      );
      map.fitBounds(bounds, {
        duration: 450,
        maxZoom: 8.5,
        padding: window.innerWidth < 768
          ? { top: 96, right: 28, bottom: 210, left: 28 }
          : { top: 92, right: 360, bottom: 72, left: 72 },
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [features, fitToMarkers, focusedSlug]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedSlug) return;
    const feature = features.find((item) => String(item.properties.slug) === focusedSlug);
    const parkRow = parks.find((park) => park.slug === focusedSlug);
    if (!feature || !parkRow) return;
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    const category = categoryForPark(parkRow);
    const selectedPark: SelectedPark = {
      ...parkRow,
      description: parkRow.description ?? "",
      hero_image_url: safeImageUrl(parkRow.hero_image_url),
      category,
    };
    setSelected(selectedPark);

    const apply = () => {
      const isMobileSearch = mode === "search" && window.innerWidth < 1024;
      const verticalOffset = isMobileSearch ? -Math.round(window.innerHeight * 0.18) : 0;
      map.easeTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), focusZoom),
        duration: 450,
        offset: [0, verticalOffset],
      });
      const sel = map.getSource("selected-park") as maplibregl.GeoJSONSource | undefined;
      sel?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              color: colorForAvailability(selectedPark.availability_pct),
              category_glyph: CATEGORY_META[selectedPark.category].glyph,
              category: selectedPark.category,
            },
            geometry: { type: "Point", coordinates: [lng, lat] },
          },
        ],
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [features, focusedSlug, focusZoom, mode, parks]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const anchorSrc = map.getSource("anchor") as maplibregl.GeoJSONSource | undefined;
      const radiusSrc = map.getSource("anchor-radius") as maplibregl.GeoJSONSource | undefined;
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
            geometry: { type: "Polygon", coordinates: [circlePolygon(anchor.lng, anchor.lat, Math.max(1, radiusKm))] },
          },
        ],
      });
      if (!focusedSlug) {
        const radiusDeg = Math.max(1, radiusKm) / 111;
        map.fitBounds(
          [
            [anchor.lng - radiusDeg * 1.5, anchor.lat - radiusDeg],
            [anchor.lng + radiusDeg * 1.5, anchor.lat + radiusDeg],
          ],
          { padding: 60, duration: 400, maxZoom: 9 },
        );
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [anchor, focusedSlug, radiusKm]);

  useEffect(() => {
    if (!selected || enabledCategories[selected.category]) return;
    setSelected(null);
    const sel = mapRef.current?.getSource("selected-park") as maplibregl.GeoJSONSource | undefined;
    sel?.setData({ type: "FeatureCollection", features: [] });
  }, [enabledCategories, selected]);

  const visibleCount = filteredParks.length;
  const selectedImage = selected ? safeImageUrl(selected.hero_image_url) : "";
  const selectedDescription = selected ? parkPreviewDescription(selected) : "";

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
      {showCategoryFilters && (
        <div className="absolute left-3 right-3 top-3 z-10 sm:left-4 sm:right-auto">
          <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg bg-stone-50/95 p-1.5 text-xs shadow-lg shadow-stone-950/10 ring-1 ring-stone-200 backdrop-blur">
            {filterCategories.map((category) => {
              const meta = CATEGORY_META[category];
              const Icon = meta.icon;
              const enabled = enabledCategories[category];
              return (
                <label
                  key={category}
                  className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium transition ${
                    enabled
                      ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-300"
                      : "text-stone-500 hover:bg-white/80 hover:text-stone-900"
                  }`}
                  title={meta.label}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={enabled}
                    onChange={(event) =>
                      setEnabledCategories((current) => ({
                        ...current,
                        [category]: event.target.checked,
                      }))
                    }
                  />
                  <Icon
                    size={13}
                    fill="none"
                  />
                  <span>{meta.shortLabel}</span>
                  <span className={enabled ? "text-stone-500" : "text-stone-400"}>
                    {categoryCounts[category]}
                  </span>
                </label>
              );
            })}
            <span className="hidden px-2 text-stone-400 sm:inline">
              {visibleCount} shown
            </span>
          </div>
        </div>
      )}
      {showCompactCategoryLegend && compactLegendCategories.length > 0 && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] sm:left-3 sm:top-3">
          <div className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-white/90 px-2 py-1.5 text-[10px] font-semibold text-stone-700 shadow-lg shadow-stone-950/10 ring-1 ring-stone-200 backdrop-blur">
            {compactLegendCategories.map((category) => {
              const meta = CATEGORY_META[category];
              const Icon = meta.icon;
              return (
                <span key={category} className="inline-flex items-center gap-1 whitespace-nowrap" title={meta.label}>
                  <Icon size={10} fill="none" />
                  {meta.shortLabel}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {selected && mode !== "search" && (
        <div className="absolute bottom-4 left-4 right-4 z-10 max-h-[calc(100dvh-10rem)] overflow-y-auto sm:right-auto sm:w-[28rem] card shadow-xl">
          {selectedImage && (
            <Link href={`/park/${selected.slug}`} className="relative block h-40 overflow-hidden bg-stone-100">
              <img
                src={selectedImage}
                alt={selected.name}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-stone-950/55 to-transparent" />
              <div className="absolute bottom-3 left-4 inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-stone-800 shadow-sm">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorForAvailability(selected.availability_pct) }}
                />
                {selected.available_sites.toLocaleString()} open
              </div>
            </Link>
          )}
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
                  {(() => {
                    const meta = CATEGORY_META[selected.category];
                    const Icon = meta.icon;
                    return (
                      <>
                        <Icon size={11} />
                        {meta.shortLabel}
                      </>
                    );
                  })()}
                </div>
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
            <p className="mt-3 text-sm leading-relaxed text-stone-600 line-clamp-3">
              {selectedDescription}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-stone-500 flex items-center gap-1">
                  <Tent size={10} /> Sites
                </div>
                <div className="font-semibold tabular-nums">
                  {selected.total_sites.toLocaleString()}
                </div>
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
                <div className="text-stone-500 flex items-center gap-1">
                  <MapPin size={10} /> Location
                </div>
                <div className="font-semibold tabular-nums">
                  {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                </div>
              </div>
            </div>
            <Link
              href={`/park/${selected.slug}`}
              className="btn-primary mt-4 w-full justify-center text-xs"
            >
              View park
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

function circlePolygon(lng: number, lat: number, radiusKm: number, steps = 64): [number, number][] {
  const R = 6371;
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
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
