import { NextResponse } from "next/server";
import { listSystemAuditLogs } from "@/modules/minibar/server/minibarDefinitionsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const entity = searchParams.get("entity") || undefined;
    const action = searchParams.get("action") || undefined;
    const hotelId = searchParams.get("hotelId") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 100;

    const logs = await listSystemAuditLogs({ entity, action, hotelId, limit });
    return NextResponse.json({ logs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Denetim kayıtları alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
