import { NextResponse } from "next/server";
import { operatorHealth } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET() {
  const ops = await operatorHealth();
  const summary: Record<string, string> = {};
  for (const op of ops) summary[op.operator.id] = `${op.median_freshness_minutes}m ago`;
  return NextResponse.json({
    ok: true,
    operators: summary,
    generated_at: new Date().toISOString(),
  });
}
