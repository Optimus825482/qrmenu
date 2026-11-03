import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { roomDetail } from "@/modules/minibar/server/floorPlan";
import { getRoomCheckView } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The room check view; `?detail=1` returns the read-only room card (current guest, next arrivals, last records). */
export async function GET(request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    if (new URL(request.url).searchParams.get("detail") === "1") return roomDetail(ctx, roomId);
    return getRoomCheckView(ctx, roomId);
  });
}
