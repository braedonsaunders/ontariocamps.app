import { NextResponse } from "next/server";
import { getAvailabilityHealth } from "@/lib/data-source";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getAvailabilityHealth();
  const summary: Record<string, string> = {};
  for (const op of health.operators) {
    const freshness = op.availableP50Minutes ?? op.currentP50Minutes;
    summary[op.operator.id] = freshness == null ? op.status : `${freshness}m ${op.status}`;
  }
  return NextResponse.json({
    ok: true,
    worker: health.worker,
    freshness: health.freshness,
    operators: summary,
    generated_at: new Date().toISOString(),
  });
}
