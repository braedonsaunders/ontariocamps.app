import { NextRequest, NextResponse } from "next/server";
import { appDate } from "@/lib/app-time";

export const dynamic = "force-dynamic";

type DailyWeather = {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
  precipitation_sum?: number[];
  wind_gusts_10m_max?: number[];
  uv_index_max?: number[];
};

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

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()));
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weatherLabel(code: number | null): string {
  if (code == null) return "Forecast";
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Clouds";
  if ([45, 48].includes(code)) return "Fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "Rain";
  if ((code >= 71 && code <= 77) || code >= 85) return "Snow";
  if (code >= 95) return "Storms";
  return "Forecast";
}

function max(values: Array<number | undefined> | undefined): number | null {
  const clean = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return clean.length ? Math.max(...clean) : null;
}

function min(values: Array<number | undefined> | undefined): number | null {
  const clean = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return clean.length ? Math.min(...clean) : null;
}

function sum(values: Array<number | undefined> | undefined): number | null {
  const clean = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return clean.length ? clean.reduce((acc, v) => acc + v, 0) : null;
}

function roundOrNull(value: number | null): number | null {
  return value == null ? null : Math.round(value);
}

function normalizeDaily(daily: DailyWeather): WeatherDay[] {
  return (daily.time ?? []).map((date, index) => {
    const precipitation = daily.precipitation_sum?.[index];
    return {
      date,
      label: weatherLabel(daily.weather_code?.[index] ?? null),
      high_c: roundOrNull(daily.temperature_2m_max?.[index] ?? null),
      low_c: roundOrNull(daily.temperature_2m_min?.[index] ?? null),
      rain_probability_pct: roundOrNull(daily.precipitation_probability_max?.[index] ?? null),
      precipitation_mm: typeof precipitation === "number" && Number.isFinite(precipitation)
        ? Math.round(precipitation * 10) / 10
        : null,
      wind_gust_kmh: roundOrNull(daily.wind_gusts_10m_max?.[index] ?? null),
      uv_index: roundOrNull(daily.uv_index_max?.[index] ?? null),
    };
  });
}

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const fromRaw = req.nextUrl.searchParams.get("from");
  const toRaw = req.nextUrl.searchParams.get("to") ?? fromRaw;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 40 || lat > 57 || lng < -96 || lng > -70) {
    return NextResponse.json({ error: "valid Ontario-ish lat and lng are required" }, { status: 400 });
  }
  if (!validDate(fromRaw) || !validDate(toRaw)) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD dates" }, { status: 400 });
  }

  const today = appDate();
  const maxForecastDate = addDays(today, 15);
  if (toRaw < today || fromRaw > maxForecastDate) {
    return NextResponse.json({
      available: false,
      reason: "forecast_window",
      forecast_window: { from: today, to: maxForecastDate },
      date_range: { requested_from: fromRaw, requested_to: toRaw },
    });
  }

  const from = fromRaw < today ? today : fromRaw;
  const to = toRaw > maxForecastDate ? maxForecastDate : toRaw;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(5));
  url.searchParams.set("longitude", lng.toFixed(5));
  url.searchParams.set("daily", [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_probability_max",
    "precipitation_sum",
    "wind_gusts_10m_max",
    "uv_index_max",
  ].join(","));
  url.searchParams.set("timezone", "America/Toronto");
  url.searchParams.set("start_date", from);
  url.searchParams.set("end_date", to);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 * 60 },
  });
  if (!response.ok) {
    return NextResponse.json({ error: "weather unavailable" }, { status: 502 });
  }

  const json = (await response.json()) as { daily?: DailyWeather };
  const daily = json.daily ?? {};
  const days = normalizeDaily(daily);
  const weatherCode = max(daily.weather_code);
  const high = max(daily.temperature_2m_max);
  const low = min(daily.temperature_2m_min);
  const rainProbability = max(daily.precipitation_probability_max);
  const precipitation = sum(daily.precipitation_sum);
  const windGust = max(daily.wind_gusts_10m_max);
  const uv = max(daily.uv_index_max);

  return NextResponse.json({
    available: true,
    partial: from !== fromRaw || to !== toRaw,
    source: "Open-Meteo",
    source_url: "https://open-meteo.com/en/docs",
    date_range: { from, to, requested_from: fromRaw, requested_to: toRaw },
    summary: {
      label: weatherLabel(weatherCode),
      high_c: high == null ? null : Math.round(high),
      low_c: low == null ? null : Math.round(low),
      rain_probability_pct: rainProbability == null ? null : Math.round(rainProbability),
      precipitation_mm: precipitation == null ? null : Math.round(precipitation * 10) / 10,
      wind_gust_kmh: windGust == null ? null : Math.round(windGust),
      uv_index: uv == null ? null : Math.round(uv),
    },
    daily: days,
  }, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=7200",
    },
  });
}
