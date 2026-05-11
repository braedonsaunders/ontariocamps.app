import { NextResponse } from "next/server";
import { operatorHealth } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ operators: await operatorHealth() });
}
