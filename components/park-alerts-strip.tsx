"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";

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
  className?: string;
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

export function ParkAlertsStrip({ operatorId, parkName, sourceUrl, compact = false, className = "" }: Props) {
  const [payload, setPayload] = useState<AlertPayload | null>(null);
  const [expanded, setExpanded] = useState(false);

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
    <div className={`${expanded ? "col-span-2" : ""} overflow-hidden rounded-md text-xs ring-1 ${severityClass(first.severity)} ${className}`}>
      <button
        type="button"
        className="flex min-h-8 w-full min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-left transition hover:bg-black/5"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <TriangleAlert size={13} className="shrink-0" />
        <span className="shrink-0 font-semibold">{alerts.length} alert{alerts.length === 1 ? "" : "s"}</span>
        <span className="min-w-0 truncate">{first.title}</span>
        <ChevronDown size={13} className={`ml-auto shrink-0 opacity-65 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-black/10 px-2.5 py-2">
          {alerts.slice(0, 3).map((alert) => (
            <div key={`${alert.title}-${alert.message.slice(0, 40)}`} className="min-w-0">
              <div className="font-semibold">{alert.title}</div>
              <p className="mt-0.5 line-clamp-2 leading-snug opacity-85">{alert.location ? `${alert.location}: ` : ""}{alert.message}</p>
            </div>
          ))}
          {payload?.source_url && (
            <a href={payload.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex font-medium underline-offset-2 hover:underline">
              Official alerts
            </a>
          )}
        </div>
      )}
    </div>
  );
}
