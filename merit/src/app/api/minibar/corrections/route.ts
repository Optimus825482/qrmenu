import { z } from "zod";
import { handle, parseQuery, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { listCorrectionRequests } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  hotelId: z.string().max(64).optional(),
  status: z.enum(["BEKLIYOR", "ONAYLANDI", "REDDEDILDI"]).optional(),
});

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(request.url).searchParams, querySchema);
    const hotelId = await selectHotel(ctx, q.hotelId, "MB-TAL", "V");
    return listCorrectionRequests({ hotelId, status: q.status });
  });
}
