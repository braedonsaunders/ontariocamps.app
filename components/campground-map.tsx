"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CampMap, Site, EquipmentOption } from "@/lib/types";
import { Minus, Plus, RotateCcw, Move, X, ExternalLink, Zap, Tent as TentIcon, Users, Caravan, Home, Mountain, Tent } from "lucide-react";

type SiteStatus = "available" | "reserved" | "closed" | "unknown";

type SiteOnMap = {
  site: Site;
  status: SiteStatus;
  nights_available: number;
  last_checked_at: string | null;
};

type SiteAvailability = {
  status: SiteStatus;
  nights_available: number;
  last_checked_at: string | null;
};

type Props = {
  campMaps: CampMap[];
  sites: Site[];
  /** Per-site availability summary keyed by site_id, used to color dots. Plain
   *  object so it can cross the server→client boundary; Maps cannot. */
  availabilitySummary: Record<string, SiteAvailability>;
  /** Per-site deep-link to the operator booking page, keyed by site_id. */
  bookingUrls?: Record<string, string>;
  /** Operator name shown on the booking-link button. */
  operatorName?: string;
  /** Equipment options at this operator (Tent / Van / Trailer-up-to-Nft / …). */
  equipmentOptions?: EquipmentOption[];
  /** Park slug, so the popover can deep-link to the site-detail page. */
  parkSlug?: string;
  /** ID of the section tab to show first; defaults to the first map. */
  initialMapId?: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 8;

/** Visible marker diameter in CSS pixels at scale=1. Inversely scaled so the
 *  marker appears the same size on screen at every zoom level. Bumped up from
 *  14 to 20 so the per-site-type icon glyph inside has room to read. */
const DOT_PX = 20;
/** Transparent hit-zone diameter — must comfortably exceed DOT_PX for usable
 *  click and tap targets. */
const HIT_PX = 32;

/** Lucide icon component to render inside a site marker, picked by site_type. */
function iconForSiteType(type: Site["site_type"]): typeof Tent {
  switch (type) {
    case "rv":
      return Caravan;
    case "cabin":
      return Home;
    case "yurt":
      // Yurt and tent share the canonical pyramid silhouette — using Tent for
      // both is fine at marker-glyph size; the popover spells out the actual
      // operator label ("Yurt", "Walk-In Tent", etc.).
      return Tent;
    case "backcountry":
      return Mountain;
    case "tent":
    default:
      return Tent;
  }
}

function dotColor(status: SiteStatus): { fill: string; ring: string; label: string } {
  // Binary green/red so the map is glanceable: green = bookable, red = not.
  // "closed" is a darker red so site-level state is still distinguishable on
  // close inspection without breaking the at-a-glance read.
  switch (status) {
    case "available":
      return { fill: "#10b981", ring: "#065f46", label: "Available" }; // emerald-500 / 800
    case "reserved":
      return { fill: "#ef4444", ring: "#7f1d1d", label: "Reserved" };  // red-500 / 900
    case "closed":
      return { fill: "#991b1b", ring: "#450a0a", label: "Closed" };    // red-800 / 950
    default:
      return { fill: "#a8a29e", ring: "#44403c", label: "Unknown" };   // stone-400 / 700
  }
}

export function CampgroundMap({
  campMaps,
  sites,
  availabilitySummary,
  bookingUrls,
  operatorName,
  equipmentOptions,
  parkSlug,
  initialMapId,
}: Props) {
  const [activeMapId, setActiveMapId] = useState<string>(
    initialMapId && campMaps.some((m) => m.id === initialMapId)
      ? initialMapId
      : campMaps[0]?.id ?? "",
  );
  // If the parent changes initialMapId after mount (e.g. user clicks a different
  // campground card), follow that selection.
  useEffect(() => {
    if (initialMapId && campMaps.some((m) => m.id === initialMapId)) {
      setActiveMapId(initialMapId);
    }
  }, [initialMapId, campMaps]);
  const activeMap = campMaps.find((m) => m.id === activeMapId) ?? campMaps[0];

  const sitesOnMap = useMemo(() => {
    if (!activeMap) return [] as SiteOnMap[];
    return sites
      .filter((s) => s.camp_map_id === activeMap.id && typeof s.map_x === "number" && typeof s.map_y === "number")
      .map((s) => {
        const a = availabilitySummary[s.id];
        return {
          site: s,
          status: a?.status ?? "unknown",
          nights_available: a?.nights_available ?? 0,
          last_checked_at: a?.last_checked_at ?? null,
        };
      });
  }, [activeMap, sites, availabilitySummary]);

  // For the in-tab counters
  const sitesByMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sites) {
      if (s.camp_map_id) m.set(s.camp_map_id, (m.get(s.camp_map_id) ?? 0) + 1);
    }
    return m;
  }, [sites]);

  if (!activeMap) return null;

  const availableCount = sitesOnMap.filter((s) => s.status === "available").length;
  const typesPresentOnMap = useMemo(() => {
    const counts = new Map<Site["site_type"], number>();
    for (const s of sitesOnMap) counts.set(s.site.site_type, (counts.get(s.site.site_type) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  }, [sitesOnMap]);

  return (
    <div className="card overflow-hidden">
      {campMaps.length > 1 && (
        <div className="flex items-center gap-1 px-3 pt-3 overflow-x-auto">
          {campMaps.map((m) => {
            const label = m.name?.trim() || `Section ${m.vendor_map_id.slice(-3)}`;
            return (
              <button
                key={m.id}
                onClick={() => setActiveMapId(m.id)}
                title={m.description ?? undefined}
                className={`px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-colors ${
                  m.id === activeMap.id
                    ? "bg-forest-700 text-white"
                    : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                {label}
                <span className="ml-1.5 opacity-70">{sitesByMap.get(m.id) ?? 0}</span>
              </button>
            );
          })}
        </div>
      )}
      {(activeMap.name?.trim() || activeMap.description?.trim()) && (
        <div className="px-4 pt-3 pb-1 flex items-baseline gap-2">
          {activeMap.name?.trim() && (
            <h3 className="text-sm font-semibold text-stone-900">{activeMap.name}</h3>
          )}
          {activeMap.description?.trim() && (
            <span className="text-xs text-stone-500">{activeMap.description}</span>
          )}
        </div>
      )}
      <PanZoomViewer
        key={activeMap.id}
        campMap={activeMap}
        sites={sitesOnMap}
        bookingUrls={bookingUrls}
        operatorName={operatorName}
        equipmentOptions={equipmentOptions}
        parkSlug={parkSlug}
      />
      <div className="flex items-center gap-x-4 gap-y-1.5 px-4 py-2.5 border-t border-stone-100 text-xs text-stone-600 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: "#10b981" }} />
          <span className="text-stone-700">{availableCount} available</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: "#ef4444" }} />
          reserved
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: "#991b1b" }} />
          closed
        </span>
        {typesPresentOnMap.length > 0 && (
          <>
            <span className="hidden sm:inline-block h-3 w-px bg-stone-200" aria-hidden />
            {typesPresentOnMap.map(({ type, count }) => {
              const Icon = iconForSiteType(type);
              return (
                <span key={type} className="inline-flex items-center gap-1 text-stone-500" title={`${count} ${type} sites`}>
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-stone-200 text-stone-700">
                    <Icon size={9} strokeWidth={2.5} aria-hidden />
                  </span>
                  <span className="capitalize">{type}</span>
                </span>
              );
            })}
          </>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-stone-500">
          <Move size={11} /> drag · scroll to zoom · click a site
        </span>
      </div>
    </div>
  );
}

function PanZoomViewer({
  campMap,
  sites,
  bookingUrls,
  operatorName,
  equipmentOptions,
  parkSlug,
}: {
  campMap: CampMap;
  sites: SiteOnMap[];
  bookingUrls?: Record<string, string>;
  operatorName?: string;
  equipmentOptions?: EquipmentOption[];
  parkSlug?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Tracks a potential drag — only escalated to "actually dragging" once the
  // pointer moves further than DRAG_THRESHOLD pixels. This lets us share the
  // pointerdown event with the buttons below so clicks register normally.
  const dragRef = useRef<{
    startX: number; startY: number; baseTx: number; baseTy: number;
    pointerId: number; active: boolean;
  } | null>(null);
  const DRAG_THRESHOLD = 4;

  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Reset on map change
  useEffect(() => {
    setTransform({ scale: 1, tx: 0, ty: 0 });
    setSelected(null);
    setHovered(null);
  }, [campMap.id]);

  function clamp(scale: number, tx: number, ty: number) {
    const el = containerRef.current;
    if (!el) return { scale, tx, ty };
    const w = el.clientWidth;
    const h = el.clientHeight;
    const sw = w * scale;
    const sh = h * scale;
    const maxTx = Math.max(0, (sw - w) / 2);
    const maxTy = Math.max(0, (sh - h) / 2);
    return {
      scale,
      tx: Math.max(-maxTx, Math.min(maxTx, tx)),
      ty: Math.max(-maxTy, Math.min(maxTy, ty)),
    };
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const delta = -e.deltaY * 0.0025;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, transform.scale * Math.exp(delta)));
    if (newScale === transform.scale) return;
    const ratio = newScale / transform.scale;
    const newTx = cx - (cx - transform.tx) * ratio;
    const newTy = cy - (cy - transform.ty) * ratio;
    setTransform(clamp(newScale, newTx, newTy));
  }

  function onPointerDown(e: React.PointerEvent) {
    // Don't intercept clicks on site pins or zoom buttons.
    const t = e.target as HTMLElement;
    if (t.closest("[data-site-pin]") || t.closest("[data-zoom-btn]")) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseTx: transform.tx,
      baseTy: transform.ty,
      pointerId: e.pointerId,
      active: false,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.active = true;
      (e.currentTarget as HTMLDivElement).setPointerCapture(drag.pointerId);
    }
    setTransform((t) => clamp(t.scale, drag.baseTx + dx, drag.baseTy + dy));
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (drag?.active) {
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(drag.pointerId);
      } catch {}
    }
    dragRef.current = null;
  }

  function zoomBy(factor: number) {
    setTransform((t) => clamp(Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor)), t.tx, t.ty));
  }
  function reset() {
    setTransform({ scale: 1, tx: 0, ty: 0 });
    setSelected(null);
  }

  const aspectRatio = `${campMap.x_dimension} / ${campMap.y_dimension}`;
  const selectedSite = selected ? sites.find((x) => x.site.id === selected) ?? null : null;
  const visibleDot = DOT_PX / transform.scale;
  const visibleHit = HIT_PX / transform.scale;

  return (
    <div className="relative bg-stone-100">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing"
        style={{ aspectRatio }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute inset-0 origin-center"
          style={{
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transition: dragRef.current?.active ? "none" : "transform 100ms ease-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={campMap.image_url}
            alt={campMap.name ?? "Campground map"}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain pointer-events-none"
          />
          <div className="absolute inset-0">
            {sites.map((s) => {
              const left = ((s.site.map_x ?? 0) / campMap.x_dimension) * 100;
              const top = ((s.site.map_y ?? 0) / campMap.y_dimension) * 100;
              const isHovered = hovered === s.site.id;
              const isSelected = selected === s.site.id;
              const { fill, ring } = dotColor(s.status);
              const grow = isHovered || isSelected ? 1.45 : 1;
              const SiteIcon = iconForSiteType(s.site.site_type);
              const markerSize = visibleDot * grow;
              const iconSize = Math.max(8, markerSize * 0.6);
              return (
                <button
                  key={s.site.id}
                  data-site-pin
                  type="button"
                  onMouseEnter={() => setHovered(s.site.id)}
                  onMouseLeave={() => setHovered((h) => (h === s.site.id ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected((cur) => (cur === s.site.id ? null : s.site.id));
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center bg-transparent border-0 p-0 focus:outline-none"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${visibleHit}px`,
                    height: `${visibleHit}px`,
                    zIndex: isHovered || isSelected ? 30 : 10,
                  }}
                  aria-label={`Site ${s.site.name}, ${s.site.site_type}, ${s.status}`}
                >
                  <span
                    className="relative grid place-items-center rounded-full text-white shadow"
                    style={{
                      width: `${markerSize}px`,
                      height: `${markerSize}px`,
                      backgroundColor: fill,
                      // Selected → swap the outer status-coloured ring for a
                      // dark high-contrast ring + a soft drop shadow, so the
                      // clicked pin reads as obviously distinct from the rest.
                      // box-shadow widths are divided by the current pan-zoom
                      // scale so they appear constant in screen pixels.
                      boxShadow: isSelected
                        ? `0 0 0 ${3 / transform.scale}px white, 0 0 0 ${5 / transform.scale}px #1c1917, 0 ${6 / transform.scale}px ${14 / transform.scale}px ${-4 / transform.scale}px rgba(0,0,0,0.35)`
                        : `0 0 0 ${2 / transform.scale}px white, 0 0 0 ${(isHovered ? 3.5 : 2.5) / transform.scale}px ${ring}`,
                      transition: "width 120ms ease-out, height 120ms ease-out, box-shadow 120ms",
                    }}
                  >
                    <SiteIcon
                      size={iconSize}
                      strokeWidth={2.5}
                      aria-hidden
                      style={{ display: "block" }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 z-20" data-zoom-btn>
          <button onClick={() => zoomBy(1.4)} className="h-8 w-8 rounded-md bg-white ring-1 ring-stone-300 hover:bg-stone-50 grid place-items-center shadow-sm" aria-label="Zoom in" type="button">
            <Plus size={14} />
          </button>
          <button onClick={() => zoomBy(1 / 1.4)} className="h-8 w-8 rounded-md bg-white ring-1 ring-stone-300 hover:bg-stone-50 grid place-items-center shadow-sm" aria-label="Zoom out" type="button">
            <Minus size={14} />
          </button>
          <button onClick={reset} className="h-8 w-8 rounded-md bg-white ring-1 ring-stone-300 hover:bg-stone-50 grid place-items-center shadow-sm" aria-label="Reset" type="button">
            <RotateCcw size={13} />
          </button>
        </div>

        <div className="absolute bottom-2 left-2 chip bg-white/95 ring-1 ring-stone-200 text-stone-600 z-20">
          {Math.round(transform.scale * 100)}%
        </div>

        {/* Hover tooltip */}
        {hovered && !selected && (() => {
          const s = sites.find((x) => x.site.id === hovered);
          if (!s) return null;
          const c = dotColor(s.status);
          return (
            <div className="absolute top-3 left-3 chip bg-white ring-1 ring-stone-200 text-stone-800 z-30 shadow-sm">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.fill }} />
              Site {s.site.name} · {c.label}
            </div>
          );
        })()}
      </div>

      {/* Selected-site popover */}
      {selectedSite && (
        <SitePopover
          site={selectedSite}
          campMap={campMap}
          bookingUrl={bookingUrls?.[selectedSite.site.id]}
          operatorName={operatorName}
          equipmentOptions={equipmentOptions}
          parkSlug={parkSlug}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SitePopover({
  site,
  campMap,
  bookingUrl,
  operatorName,
  equipmentOptions,
  parkSlug,
  onClose,
}: {
  site: SiteOnMap;
  campMap: CampMap;
  bookingUrl: string | undefined;
  operatorName?: string;
  equipmentOptions?: EquipmentOption[];
  parkSlug?: string;
  onClose: () => void;
}) {
  const c = dotColor(site.status);
  // Crop a small region of the operator-branded map around the site's pixel
  // position to act as a "thumbnail". Render the source image at K source-pixels
  // per CSS pixel and position so the site lands at the thumb's centre.
  const K = 2.5; // CSS-px per image-px
  const THUMB = 96;
  const bgW = campMap.x_dimension * K;
  const bgH = campMap.y_dimension * K;
  const bgX = `${THUMB / 2 - (site.site.map_x ?? 0) * K}px`;
  const bgY = `${THUMB / 2 - (site.site.map_y ?? 0) * K}px`;
  const photos = (site.site.photos ?? []).filter((p) => p.url || p.avifUrl);
  const description = site.site.description?.trim();
  return (
    <div className="absolute left-3 bottom-3 right-3 sm:right-auto sm:w-80 card p-0 shadow-xl ring-stone-300/70 z-40 overflow-hidden">
      {photos.length > 0 && (
        <div className="relative aspect-[16/10] bg-stone-200 overflow-hidden w-full">
          {/* Show only the first photo at popover width; the full gallery
           *  lives on the dedicated /site detail page. Avoids horizontal
           *  scroll inside a 320 px popover where it just feels broken. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[0].url ?? photos[0].avifUrl ?? ""}
            alt={`Site ${site.site.name}`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          {photos.length > 1 && (
            <span className="absolute bottom-1.5 right-1.5 chip bg-black/55 text-white text-[10px] backdrop-blur-sm border-0">
              +{photos.length - 1} more
            </span>
          )}
        </div>
      )}
      <div className="flex gap-3 p-3">
        {/* Mini thumbnail showing the site's position on the operator map */}
        <div
          className="shrink-0 rounded-md overflow-hidden ring-1 ring-stone-200 relative bg-stone-100"
          style={{
            width: THUMB,
            height: THUMB,
            backgroundImage: `url(${campMap.image_url})`,
            backgroundSize: `${bgW}px ${bgH}px`,
            backgroundPosition: `${bgX} ${bgY}`,
            backgroundRepeat: "no-repeat",
          }}
        >
          <span
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 12,
              height: 12,
              backgroundColor: c.fill,
              boxShadow: `0 0 0 2px white, 0 0 0 3.5px ${c.ring}`,
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold leading-tight">Site {site.site.name}</div>
            <button
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 transition-colors shrink-0"
              aria-label="Close"
              type="button"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-0.5 text-xs text-stone-600">
            {site.site.site_type_label ?? site.site.site_type.toUpperCase()}
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span
              className={`chip ring-1 ${
                site.status === "available"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : site.status === "reserved"
                  ? "bg-red-50 text-red-700 ring-red-200"
                  : site.status === "closed"
                  ? "bg-red-100 text-red-900 ring-red-300"
                  : "bg-stone-100 text-stone-600 ring-stone-200"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.fill }} />
              {c.label}
            </span>
            {site.site.has_electric && (
              <span className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                <Zap size={10} /> Electric
              </span>
            )}
            {site.site.is_waterfront && (
              <span className="chip bg-lake-50 text-lake-800 ring-1 ring-lake-200">Waterfront</span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-stone-100 px-3 py-2 text-xs text-stone-600 space-y-1.5">
        {description && (
          <div className="text-stone-700 leading-relaxed pb-1">
            {description}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Users size={11} className="text-stone-400" />
          Up to {site.site.max_party_size} people
          {site.nights_available > 0 && (
            <span className="ml-auto text-emerald-700">
              {site.nights_available} {site.nights_available === 1 ? "night" : "nights"} open
            </span>
          )}
        </div>
        {equipmentOptions && equipmentOptions.length > 0 && (
          <div className="flex items-start gap-1.5">
            <TentIcon size={11} className="text-stone-400 mt-0.5 shrink-0" />
            <span>
              <span className="text-stone-500">Allows: </span>
              {equipmentOptions.slice(0, 4).map((e) => e.name).join(" · ")}
              {equipmentOptions.length > 4 && <span className="text-stone-400"> · +{equipmentOptions.length - 4}</span>}
            </span>
          </div>
        )}
        <div className="text-[10px] text-stone-400 pt-0.5">
          Rates set by operator at booking. Pricing isn&apos;t exposed via the public API.
        </div>
      </div>

      <div className="flex gap-2 px-3 pb-3 pt-0">
        {parkSlug && (
          <Link
            href={`/park/${parkSlug}/site/${site.site.vendor_site_id}`}
            className="btn-secondary flex-1 text-xs justify-center"
          >
            Details
          </Link>
        )}
        {bookingUrl && (
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex-1 text-xs justify-center"
          >
            Book <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
