import { NextRequest, NextResponse } from "next/server";
import { fetchParkAlerts } from "@/lib/park-alerts";
import { cleanIdentifier } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const operatorId = cleanIdentifier(req.nextUrl.searchParams.get("operator_id"));
  const parkName = (req.nextUrl.searchParams.get("park_name") ?? "").trim().slice(0, 120);
  const sourceUrl = req.nextUrl.searchParams.get("source_url");

  if (!operatorId || !parkName) {
    return NextResponse.json({ error: "operator_id and park_name are required" }, { status: 400 });
  }

  const payload = await fetchParkAlerts({ operatorId, parkName, sourceUrl });
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
