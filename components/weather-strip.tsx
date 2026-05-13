"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudSun, Droplets, Sun, Wind } from "lucide-react";

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
};

const weatherCache = new Map<string, WeatherPayload | null>();
const weatherRequests = new Map<string, Promise<WeatherPayload | null>>();

function value(value: number | null | undefined, suffix: string) {
  return value == null ? null : `${value}${suffix}`;
}

export function WeatherStrip({ lat, lng, from, to, compact = false }: Props) {
  const [payload, setPayload] = useState<WeatherPayload | null>(null);

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
    <div className="grid gap-2 rounded-lg bg-lake-50/70 p-3 text-sm text-stone-700 ring-1 ring-lake-100 sm:grid-cols-4">
      <div className="inline-flex min-w-0 items-center gap-2">
        <CloudSun size={15} className="shrink-0 text-lake-700" />
        <span className="truncate font-semibold text-stone-900">{s.label}{temp ? ` / ${temp}` : ""}</span>
      </div>
      {rain && (
        <div className="inline-flex items-center gap-2">
          <Droplets size={15} className="text-lake-700" />
          <span>{rain}{s.precipitation_mm ? ` / ${s.precipitation_mm} mm` : ""}</span>
        </div>
      )}
      {wind && (
        <div className="inline-flex items-center gap-2">
          <Wind size={15} className="text-stone-600" />
          <span>{wind}</span>
        </div>
      )}
      {uv && (
        <div className="inline-flex items-center gap-2">
          <Sun size={15} className="text-amber-600" />
          <span>{uv}</span>
        </div>
      )}
    </div>
  );
}
