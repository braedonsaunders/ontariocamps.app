"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import { Maximize2, X } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

type Props = {
  parkName: string;
  location: { lat: number; lng: number };
  zoom?: number;
};

export function ParkLocationMap({ parkName, location, zoom = 14 }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const titleId = useId();

  const closeModal = useCallback(() => setIsModalOpen(false), []);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeModal, isModalOpen]);

  const modal = isModalOpen && portalRoot
    ? createPortal(
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-3 sm:p-6"
        role="dialog"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}
      >
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10">
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-stone-200 px-4 py-2.5">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-sm font-semibold text-stone-900">
                {parkName}
              </h2>
              <p className="mt-0.5 text-xs tabular-nums text-stone-500">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
              aria-label="Close map"
              title="Close map"
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <div className="relative h-[min(72vh,640px)] min-h-[340px] bg-stone-100">
            <LocationMapCanvas
              parkName={parkName}
              location={location}
              zoom={zoom}
              interactive
              showControls
            />
          </div>
        </div>
      </div>,
      portalRoot,
    )
    : null;

  return (
    <>
      <div
        className="group relative h-28 w-full overflow-hidden border-b border-stone-200 bg-stone-100"
        aria-label={`Map showing ${parkName}`}
      >
        <LocationMapCanvas parkName={parkName} location={location} zoom={zoom} />
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="absolute inset-0 cursor-zoom-in"
          aria-label={`Open interactive map for ${parkName}`}
        >
          <span className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/95 text-stone-700 shadow-sm ring-1 ring-stone-200 transition-colors group-hover:bg-white group-hover:text-forest-800">
            <Maximize2 size={15} aria-hidden />
          </span>
        </button>
      </div>
      {modal}
    </>
  );
}

type LocationMapCanvasProps = Props & {
  interactive?: boolean;
  showControls?: boolean;
};

function LocationMapCanvas({
  parkName,
  location,
  zoom = 14,
  interactive = false,
  showControls = false,
}: LocationMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const initialCenterRef = useRef<[number, number]>([location.lng, location.lat]);
  const initialZoomRef = useRef(zoom);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: initialCenterRef.current,
      zoom: initialZoomRef.current,
      attributionControl: { compact: true },
      interactive,
    });

    if (showControls) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    }

    map.once("load", () => map.resize());
    const resizeFrame = window.requestAnimationFrame(() => map.resize());
    mapRef.current = map;

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [interactive, showControls]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const coordinates: [number, number] = [location.lng, location.lat];
    map.easeTo({ center: coordinates, zoom, duration: interactive ? 200 : 300 });

    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ color: "#37562e", scale: 0.82 })
        .setLngLat(coordinates)
        .addTo(map);
      marker.getElement().setAttribute("aria-label", `${parkName} location`);
      markerRef.current = marker;
      return;
    }

    markerRef.current.setLngLat(coordinates);
  }, [interactive, location.lat, location.lng, parkName, zoom]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
