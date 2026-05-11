"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export type GalleryPhoto = {
  url: string | null;
  avifUrl: string | null;
  aspectType: number;
};

type Props = {
  photos: GalleryPhoto[];
  alt: string;
};

/**
 * Responsive photo gallery: a tall main photo + grid of thumbnails on desktop,
 * a single tap-to-expand main photo on mobile. Click any to open the lightbox.
 *
 * The lightbox supports keyboard arrows + Escape and shows photo N of M.
 */
export function PhotoGallery({ photos, alt }: Props) {
  const valid = photos.filter((p) => p.url || p.avifUrl);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIdx(null);
      else if (e.key === "ArrowRight") setLightboxIdx((i) => (i === null ? null : (i + 1) % valid.length));
      else if (e.key === "ArrowLeft") setLightboxIdx((i) => (i === null ? null : (i - 1 + valid.length) % valid.length));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxIdx, valid.length]);

  // Lock body scroll while lightbox is open
  useEffect(() => {
    if (lightboxIdx === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxIdx]);

  if (valid.length === 0) {
    return (
      <div className="card aspect-[16/9] sm:aspect-[2/1] flex items-center justify-center text-sm text-stone-500">
        No photos available for this site.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-4 sm:grid-rows-2 sm:aspect-[2/1]">
        <button
          type="button"
          onClick={() => setLightboxIdx(0)}
          className="relative overflow-hidden rounded-lg ring-1 ring-stone-200 sm:col-span-2 sm:row-span-2 group aspect-[4/3] sm:aspect-auto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={valid[0].url ?? valid[0].avifUrl ?? ""}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            loading="eager"
          />
        </button>
        {valid.slice(1, 5).map((p, i) => (
          <button
            key={(p.url ?? p.avifUrl ?? "") + String(i)}
            type="button"
            onClick={() => setLightboxIdx(i + 1)}
            className="relative overflow-hidden rounded-lg ring-1 ring-stone-200 hidden sm:block group aspect-square"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url ?? p.avifUrl ?? ""}
              alt={`${alt} ${i + 2}`}
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
              loading="lazy"
            />
            {i === 3 && valid.length > 5 && (
              <div className="absolute inset-0 bg-black/55 text-white flex items-center justify-center text-sm font-medium">
                +{valid.length - 5} more
              </div>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {lightboxIdx !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
            onClick={() => setLightboxIdx(null)}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx(null);
              }}
              className="absolute top-4 right-4 h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx((i) => (i === null ? null : (i - 1 + valid.length) % valid.length));
              }}
              className="absolute left-4 sm:left-8 h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Previous photo"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIdx((i) => (i === null ? null : (i + 1) % valid.length));
              }}
              className="absolute right-4 sm:right-8 h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Next photo"
            >
              <ChevronRight size={20} />
            </button>
            <motion.img
              key={lightboxIdx}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              src={valid[lightboxIdx].url ?? valid[lightboxIdx].avifUrl ?? ""}
              alt={`${alt} ${lightboxIdx + 1}`}
              className="max-h-[88vh] max-w-[92vw] object-contain rounded-md"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 chip bg-white/10 text-white text-xs backdrop-blur-sm border-0">
              {lightboxIdx + 1} / {valid.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
