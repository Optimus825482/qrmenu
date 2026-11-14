import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { deleteMyTransactions } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ transactionIds: z.array(z.string().min(1).max(64)).min(1).max(50) });

/** Deletes several records of today at once (one room group of İşlemlerim); all or nothing. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(request, bodySchema);
    return deleteMyTransactions(ctx, body);
  });
}
