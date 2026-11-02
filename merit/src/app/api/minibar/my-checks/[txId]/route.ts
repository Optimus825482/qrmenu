import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import {
  deleteRoomCheckToday,
  minibarTransactionHotel,
  updateRoomCheckToday,
} from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  updatedItems: z
    .array(z.object({ productId: z.string().min(1).max(64), qty: z.number().int().min(0).max(99) }))
    .max(200),
  note: z.string().max(500).optional(),
});

/** Author or MB-TUK approver; the hotel always comes from the transaction itself. */
async function authorise(ctx: Ctx, txId: string) {
  const hotelId = await minibarTransactionHotel(txId);
  await assertCan(ctx, "MB-TUK", "D", hotelId);
  const canApprove = await can(ctx, "MB-TUK", "A", hotelId);
  return { hotelId, canApprove };
}

export async function DELETE(_request: Request, props: { params: Promise<{ txId: string }> }) {
  return handle(async (ctx) => {
    const { txId } = await props.params;
    const { hotelId, canApprove } = await authorise(ctx, txId);
    return deleteRoomCheckToday({ transactionId: txId, userId: ctx.user.id, hotelId, canApprove });
  });
}

export async function PATCH(request: Request, props: { params: Promise<{ txId: string }> }) {
  return handle(async (ctx) => {
    const { txId } = await props.params;
    const { hotelId, canApprove } = await authorise(ctx, txId);
    const body = await parseBody(request, patchSchema);
    return updateRoomCheckToday({ transactionId: txId, userId: ctx.user.id, hotelId, canApprove, ...body });
  });
}
