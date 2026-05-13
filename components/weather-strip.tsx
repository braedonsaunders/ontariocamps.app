"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CloudSun, Droplets, Sun, Wind } from "lucide-react";

type WeatherDay = {
  date: string;
  label: string;
  high_c: number | null;
  low_c: number | null;
  rain_probability_pct: number | null;
  precipitation_mm: number | null;
  wind_gust_kmh: number | null;
  uv_index: number | null;
};

type WeatherPayload = {
  available: boolean;
  reason?: "forecast_window" | string;
  partial?: boolean;
  forecast_window?: { from: string; to: string };
  summary?: {
    label: string;
    high_c: number | null;
    low_c: number | null;
    rain_probability_pct: number | null;
    precipitation_mm: number | null;
    wind_gust_kmh: number | null;
    uv_index: number | null;
  };
  daily?: WeatherDay[];
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

function shortDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(date);
}

function tempRange(high: number | null | undefined, low: number | null | undefined) {
  return high == null || low == null ? null : `${high}/${low}C`;
}

export function WeatherStrip({ lat, lng, from, to, compact = false, className = "" }: Props) {
  const rootRef = useRef<HTMLDivElement | HTMLSpanElement | null>(null);
  const [payload, setPayload] = useState<WeatherPayload | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);

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

  function setRootRef(node: HTMLDivElement | HTMLSpanElement | null) {
    rootRef.current = node;
  }

  useEffect(() => {
    setPayload(null);
    setExpanded(false);
    setShouldFetch(false);
  }, [url]);

  useEffect(() => {
    if (!url) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShouldFetch(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldFetch(true);
        observer.disconnect();
      },
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);

  useEffect(() => {
    if (!url) {
      setPayload(null);
      return;
    }
    if (!shouldFetch) return;
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
  }, [shouldFetch, url]);

  if (!payload) {
    return compact
      ? <span ref={setRootRef} className="inline-block h-px w-px" aria-hidden />
      : <div ref={setRootRef} className="h-px w-px" aria-hidden />;
  }

  const tooFarOut = !payload.available && payload.reason === "forecast_window";
  const windowLabel = payload.forecast_window
    ? `${shortDate(payload.forecast_window.from)}-${shortDate(payload.forecast_window.to)}`
    : null;

  if (tooFarOut) {
    if (compact) {
      return (
        <span
          ref={setRootRef}
          className={`mt-1 inline-flex max-w-full items-center gap-1 text-[11px] text-stone-500 ${className}`}
          title={windowLabel ? `Forecasts are currently available for ${windowLabel}.` : "Forecast is too far out."}
        >
          <CloudSun size={12} className="shrink-0 text-stone-400" />
          <span className="truncate">Forecast too far out</span>
        </span>
      );
    }

    return (
      <div ref={setRootRef} className={`rounded-md bg-stone-50 px-2.5 py-2 text-xs text-stone-600 ring-1 ring-stone-200 ${className}`}>
        <div className="flex min-w-0 items-center gap-1.5">
          <CloudSun size={13} className="shrink-0 text-stone-500" />
          <span className="font-semibold text-stone-800">Forecast too far out</span>
        </div>
        {windowLabel && (
          <div className="mt-1 leading-snug text-stone-500">Daily forecasts are available for {windowLabel}.</div>
        )}
      </div>
    );
  }

  if (!payload?.available || !payload.summary) return null;

  const s = payload.summary;
  const days = payload.daily ?? [];
  const temp = tempRange(s.high_c, s.low_c);
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
      <span ref={setRootRef} className={`mt-1 inline-flex max-w-full items-center gap-1 overflow-hidden text-[11px] text-stone-600 ${className}`}>
        <CloudSun size={12} className="shrink-0 text-lake-700" />
        <span className="shrink-0 font-medium">{s.label}</span>
        {days.length > 1 && <span className="shrink-0 text-stone-400">{days.length}d</span>}
        {temp && <span className="shrink-0 text-stone-500">{temp}</span>}
        {rain && <span className="truncate text-stone-500">{rain}</span>}
        {payload.partial && <span className="shrink-0 text-stone-400">partial</span>}
      </span>
    );
  }

  return (
    <div ref={setRootRef} className={`${expanded ? "col-span-2" : ""} overflow-hidden rounded-md bg-white text-xs text-stone-700 ring-1 ring-stone-200 ${className}`}>
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
        {days.length > 1 && <span className="shrink-0 text-stone-400">{days.length} days</span>}
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

      {expanded && days.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto border-t border-stone-100 px-2.5 py-2 text-[11px]">
          {days.map((day) => {
            const dayTemp = tempRange(day.high_c, day.low_c);
            const dayRain = value(day.rain_probability_pct, "% rain");
            return (
              <div key={day.date} className="flex min-w-0 items-center gap-2">
                <span className="w-12 shrink-0 font-semibold text-stone-800">{shortDate(day.date)}</span>
                <span className="min-w-0 flex-1 truncate text-stone-600">{day.label}</span>
                {dayTemp && <span className="shrink-0 tabular-nums text-stone-500">{dayTemp}</span>}
                {dayRain && <span className="shrink-0 text-stone-500">{dayRain}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
