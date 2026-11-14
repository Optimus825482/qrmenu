import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { createCorrectionRequests } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  transactionIds: z.array(z.string().min(1).max(64)).min(1).max(50),
  reason: z.string().trim().min(1, "Gerekçe zorunludur.").max(500),
});

/** Past-dated records of one room group: deletion requests for the Oda Servisi Sorumlusu. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(request, bodySchema);
    return createCorrectionRequests(ctx, body);
  });
}
