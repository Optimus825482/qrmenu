import { handle, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { getKatDashboardData } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(request.url).searchParams.get("hotelId"), "MB-KAT", "V");
    return getKatDashboardData(hotelId);
  });
}
