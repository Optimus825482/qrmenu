import { assertCan } from "@/lib/rbac";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { getRoomInspectionData, roomHotel } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    const hotelId = await roomHotel(roomId);
    await assertCan(ctx, "MB-TUK", "V", hotelId);
    return getRoomInspectionData(roomId, hotelId);
  });
}
