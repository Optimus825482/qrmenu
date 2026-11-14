import { z } from "zod";
import { can } from "@/lib/rbac";
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
    if (q.hotelId) {
      const hotelId = await selectHotel(ctx, q.hotelId, "MB-TAL", "V");
      return listCorrectionRequests({ hotelId, status: q.status });
    }
    // No hotel picked: the requests of every hotel of the user's scope they may view (R-OSS works across hotels).
    const viewable: string[] = [];
    for (const h of ctx.hotelIds) if (await can(ctx, "MB-TAL", "V", h)) viewable.push(h);
    if (viewable.length === 0) await selectHotel(ctx, undefined, "MB-TAL", "V");
    return listCorrectionRequests({ hotelIds: viewable, status: q.status });
  });
}
