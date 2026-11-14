import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { deleteRoomCheck, updateRoomCheck } from "@/modules/minibar/server/roomCheckAdminService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  updatedItems: z
    .array(z.object({ productId: z.string().min(1).max(64), qty: z.number().int().min(0).max(999) }))
    .max(50),
  note: z.string().max(300).optional(),
  reason: z.string().max(500).optional(),
});

const deleteSchema = z.object({ reason: z.string().max(500) });

export async function PATCH(request: Request, props: { params: Promise<{ txId: string }> }) {
  return handle(async (ctx) => {
    const { txId } = await props.params;
    const body = await parseBody(request, patchSchema);
    return updateRoomCheck(ctx, { transactionId: txId, ...body });
  });
}

/** The delete reason travels in the JSON body (audited). */
export async function DELETE(request: Request, props: { params: Promise<{ txId: string }> }) {
  return handle(async (ctx) => {
    const { txId } = await props.params;
    const body = await parseBody(request, deleteSchema);
    return deleteRoomCheck(ctx, { transactionId: txId, reason: body.reason });
  });
}
