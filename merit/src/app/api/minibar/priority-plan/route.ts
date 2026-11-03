import { handle, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { getAdvisoryPriorityPlan } from "@/modules/minibar/server/floorPlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(request.url).searchParams.get("hotelId"), "MB-KAT", "V");
    return getAdvisoryPriorityPlan(hotelId);
  });
}
