import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { createCorrectionRequest } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  transactionId: z.string().min(1).max(64),
  actionType: z.enum(["SILME", "DUZELTME"]),
  reason: z.string().trim().min(1, "Gerekçe zorunludur.").max(500),
  proposedData: z.record(z.string().max(64), z.number().int().min(0).max(999)).optional(),
});

/** Past-dated record: the warehouse officer (MB-TAL D) asks for a deletion/correction. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(request, bodySchema);
    return createCorrectionRequest(ctx, body);
  });
}
