import { z } from "zod";
import { assertCan } from "@/lib/rbac";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { createPastDateCorrectionRequest, minibarTransactionHotel } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  transactionId: z.string().min(1).max(64),
  actionType: z.enum(["SILME", "DUZELTME"]),
  reason: z.string().trim().min(1, "Gerekçe zorunludur.").max(500),
  proposedData: z.record(z.string().max(64), z.number().int().min(0).max(99)).optional(),
});

export async function POST(request: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(request, bodySchema);
    const hotelId = await minibarTransactionHotel(body.transactionId);
    await assertCan(ctx, "MB-TAL", "O", hotelId);
    return createPastDateCorrectionRequest({ ...body, hotelId, requestedById: ctx.user.id });
  });
}
