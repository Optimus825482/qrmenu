import { assertCan } from "@/lib/rbac";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { floorHotel, getFloorRoomsData } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ floorId: string }> }) {
  return handle(async (ctx) => {
    const { floorId } = await props.params;
    const hotelId = await floorHotel(floorId); // the floor decides the hotel, not the query string
    await assertCan(ctx, "MB-KAT", "V", hotelId);
    return getFloorRoomsData(floorId, hotelId);
  });
}
