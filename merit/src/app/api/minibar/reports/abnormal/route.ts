import { NextRequest, NextResponse } from "next/server";
import { getAbnormalConsumption } from "@/modules/minibar/server/abnormalConsumptionService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelId = searchParams.get("hotelId") || undefined;
    const date = searchParams.get("date") || undefined;
    const threshold = searchParams.get("threshold") ? Number(searchParams.get("threshold")) : undefined;

    const report = await getAbnormalConsumption({
      hotelId,
      date,
      roomThreshold: threshold,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Anormal tüketim raporu alınamadı.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
