"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, CloudSun, Droplets, Sun, Wind } from "lucide-react";

type WeatherPayload = {
  available: boolean;
  partial?: boolean;
  summary?: {
    label: string;
    high_c: number | null;
    low_c: number | null;
    rain_probability_pct: number | null;
    precipitation_mm: number | null;
    wind_gust_kmh: number | null;
    uv_index: number | null;
  };
};

type Props = {
  lat: number;
  lng: number;
  from?: string | null;
  to?: string | null;
  compact?: boolean;
  className?: string;
};

const weatherCache = new Map<string, WeatherPayload | null>();
const weatherRequests = new Map<string, Promise<WeatherPayload | null>>();

function value(value: number | null | undefined, suffix: string) {
  return value == null ? null : `${value}${suffix}`;
}

export function WeatherStrip({ lat, lng, from, to, compact = false, className = "" }: Props) {
  const [payload, setPayload] = useState<WeatherPayload | null>(null);
  const [expanded, setExpanded] = useState(false);

  const url = useMemo(() => {
    if (!from || !to) return null;
    const sp = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      from,
      to,
    });
    return `/api/weather?${sp.toString()}`;
  }, [from, lat, lng, to]);

  useEffect(() => {
    if (!url) {
      setPayload(null);
      return;
    }
    if (weatherCache.has(url)) {
      setPayload(weatherCache.get(url) ?? null);
      return;
    }

    let cancelled = false;
    let request = weatherRequests.get(url);
    if (!request) {
      request = fetch(url)
        .then((response) => (response.ok ? response.json() : null))
        .then((data: WeatherPayload | null) => {
          weatherCache.set(url, data);
          return data;
        })
        .catch(() => null)
        .finally(() => {
          weatherRequests.delete(url);
        });
      weatherRequests.set(url, request);
    }
    request
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!payload?.available || !payload.summary) return null;

  const s = payload.summary;
  const temp = s.high_c == null || s.low_c == null ? null : `${s.high_c}/${s.low_c}C`;
  const rain = value(s.rain_probability_pct, "% rain");
  const wind = value(s.wind_gust_kmh, " km/h gusts");
  const uv = value(s.uv_index, " UV");
  const precip = value(s.precipitation_mm, " mm");
  const detailItems = [
    rain || precip ? { icon: Droplets, label: "Precip", value: [rain, precip].filter(Boolean).join(" / ") } : null,
    wind ? { icon: Wind, label: "Gusts", value: wind } : null,
    uv ? { icon: Sun, label: "UV", value: uv } : null,
  ].filter((item): item is { icon: typeof CloudSun; label: string; value: string } => Boolean(item));

  if (compact) {
    return (
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md bg-white/80 px-2 py-1 text-[11px] text-stone-700 ring-1 ring-stone-200">
        <CloudSun size={12} className="shrink-0 text-lake-700" />
        <span className="shrink-0 font-medium">{s.label}</span>
        {temp && <span className="shrink-0 text-stone-500">{temp}</span>}
        {rain && <span className="truncate text-stone-500">{rain}</span>}
      </div>
    );
  }

  return (
    <div className={`${expanded ? "col-span-2" : ""} overflow-hidden rounded-md bg-white text-xs text-stone-700 ring-1 ring-stone-200 ${className}`}>
      <button
        type="button"
        className="flex min-h-8 w-full min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-left transition hover:bg-stone-50"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <CloudSun size={13} className="shrink-0 text-lake-700" />
        <span className="shrink-0 font-semibold text-stone-900">{s.label}</span>
        {temp && <span className="shrink-0 text-stone-500">{temp}</span>}
        {rain && <span className="min-w-0 truncate text-stone-500">{rain}</span>}
        {payload.partial && <span className="shrink-0 text-stone-400">partial</span>}
        <ChevronDown size={13} className={`ml-auto shrink-0 text-stone-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && detailItems.length > 0 && (
        <div className="grid gap-1.5 border-t border-stone-100 px-2.5 py-2 text-[11px] sm:grid-cols-3">
          {detailItems.map((item) => (
            <div key={item.label} className="inline-flex min-w-0 items-center gap-1.5">
              <item.icon size={12} className="shrink-0 text-stone-500" />
              <span className="shrink-0 font-medium text-stone-600">{item.label}</span>
              <span className="min-w-0 truncate text-stone-500">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
