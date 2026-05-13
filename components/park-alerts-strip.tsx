"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";

type ParkAlert = {
  title: string;
  type: string;
  message: string;
  location?: string | null;
  severity: "info" | "warning" | "danger";
  source_url: string;
};

type AlertPayload = {
  alerts: ParkAlert[];
  source_url: string | null;
};

type Props = {
  operatorId: string;
  parkName: string;
  sourceUrl?: string | null;
  compact?: boolean;
};

const alertCache = new Map<string, AlertPayload | null>();
const alertRequests = new Map<string, Promise<AlertPayload | null>>();

function severityClass(severity: ParkAlert["severity"]) {
  if (severity === "danger") return "bg-red-50 text-red-800 ring-red-200";
  if (severity === "warning") return "bg-amber-50 text-amber-900 ring-amber-200";
  return "bg-stone-50 text-stone-700 ring-stone-200";
}

function canParse(operatorId: string) {
  return operatorId === "ontario_parks" || operatorId === "st_lawrence_parks";
}

export function ParkAlertsStrip({ operatorId, parkName, sourceUrl, compact = false }: Props) {
  const [payload, setPayload] = useState<AlertPayload | null>(null);

  const url = useMemo(() => {
    if (!canParse(operatorId)) return null;
    const sp = new URLSearchParams({ operator_id: operatorId, park_name: parkName });
    if (sourceUrl) sp.set("source_url", sourceUrl);
    return `/api/alerts?${sp.toString()}`;
  }, [operatorId, parkName, sourceUrl]);

  useEffect(() => {
    if (!url) {
      setPayload(null);
      return;
    }
    if (alertCache.has(url)) {
      setPayload(alertCache.get(url) ?? null);
      return;
    }

    let cancelled = false;
    let request = alertRequests.get(url);
    if (!request) {
      request = fetch(url)
        .then((response) => (response.ok ? response.json() : null))
        .then((data: AlertPayload | null) => {
          alertCache.set(url, data);
          return data;
        })
        .catch(() => null)
        .finally(() => {
          alertRequests.delete(url);
        });
      alertRequests.set(url, request);
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

  const alerts = payload?.alerts ?? [];
  if (alerts.length === 0) return null;

  const first = alerts[0];
  if (compact) {
    return (
      <div className={`mt-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ring-1 ${severityClass(first.severity)}`}>
        <TriangleAlert size={12} className="shrink-0" />
        <span className="shrink-0 font-semibold">{alerts.length} alert{alerts.length === 1 ? "" : "s"}</span>
        <span className="truncate">{first.title}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.slice(0, 3).map((alert) => (
        <div key={`${alert.title}-${alert.message.slice(0, 40)}`} className={`rounded-lg p-3 text-sm ring-1 ${severityClass(alert.severity)}`}>
          <div className="flex items-start gap-2">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">{alert.title}</div>
              <p className="mt-0.5 line-clamp-2">{alert.location ? `${alert.location}: ` : ""}{alert.message}</p>
            </div>
          </div>
        </div>
      ))}
      {payload?.source_url && (
        <a href={payload.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex text-xs font-medium text-forest-700 hover:text-forest-800">
          Official alerts
        </a>
      )}
    </div>
  );
}
