import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { deleteMyTransaction, updateMyTransaction } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  updatedItems: z
    .array(z.object({ productId: z.string().min(1).max(64), qty: z.number().int().min(0).max(999) }))
    .max(50),
  note: z.string().max(300).optional(),
});

export async function DELETE(_request: Request, props: { params: Promise<{ txId: string }> }) {
  return handle(async (ctx) => {
    const { txId } = await props.params;
    return deleteMyTransaction(ctx, txId);
  });
}

export async function PATCH(request: Request, props: { params: Promise<{ txId: string }> }) {
  return handle(async (ctx) => {
    const { txId } = await props.params;
    const body = await parseBody(request, patchSchema);
    return updateMyTransaction(ctx, { transactionId: txId, ...body });
  });
}
