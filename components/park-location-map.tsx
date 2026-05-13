"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

type Props = {
  parkName: string;
  location: { lat: number; lng: number };
  zoom?: number;
};

export function ParkLocationMap({ parkName, location, zoom = 12.8 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [location.lng, location.lat],
      zoom,
      attributionControl: { compact: true },
      interactive: false,
    });

    map.once("load", () => map.resize());
    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [location.lat, location.lng, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const coordinates: [number, number] = [location.lng, location.lat];
    map.easeTo({ center: coordinates, zoom, duration: 300 });

    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ color: "#37562e", scale: 0.82 })
        .setLngLat(coordinates)
        .addTo(map);
      marker.getElement().setAttribute("aria-label", `${parkName} location`);
      markerRef.current = marker;
      return;
    }

    markerRef.current.setLngLat(coordinates);
  }, [location.lat, location.lng, parkName, zoom]);

  return (
    <div
      className="relative h-28 w-full overflow-hidden border-b border-stone-200 bg-stone-100"
      aria-label={`Map showing ${parkName}`}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
