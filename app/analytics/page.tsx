import type { Metadata } from "next";
import { getAnalyticsSnapshot } from "@/lib/analytics";
import { AnalyticsView } from "@/components/analytics-view";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Live data on Ontario campsite availability — booking pressure, type breakdowns, busiest parks.",
};

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const snap = getAnalyticsSnapshot();
  return <AnalyticsView snapshot={snap} />;
}
