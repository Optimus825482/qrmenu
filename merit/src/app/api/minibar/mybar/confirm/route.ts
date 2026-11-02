import { z } from "zod";
import { assertCan } from "@/lib/rbac";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { confirmMybarRequest, mybarRequestHotel } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ requestId: z.string().min(1, "Talep ID belirtilmedi.").max(64) });

export async function POST(request: Request) {
  return handle(async (ctx) => {
    const { requestId } = await parseBody(request, bodySchema);
    const hotelId = await mybarRequestHotel(requestId);
    await assertCan(ctx, "MB-PERS", "D", hotelId);
    return confirmMybarRequest(requestId, ctx.user.id, hotelId);
  });
}
