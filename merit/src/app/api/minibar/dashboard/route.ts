import { handle, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { katPlan } from "@/modules/minibar/server/floorPlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The floor attendant's plan; `?hotelId=` picks another hotel of the user's scope (the hotel selector). */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(request.url).searchParams.get("hotelId"), "MB-KAT", "V");
    return katPlan(hotelId === ctx.session.hotelId ? ctx : { ...ctx, session: { ...ctx.session, hotelId } });
  });
}
