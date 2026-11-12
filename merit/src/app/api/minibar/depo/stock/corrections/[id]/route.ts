import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { resolveStockCorrection } from "@/modules/minibar/server/stockCorrections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ approve: z.boolean(), note: z.string().max(200).optional() }).strict();

/** Approve or reject one stock correction request (system administrator). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const { id } = await params;
    const body = await parseBody(request, bodySchema);
    return resolveStockCorrection(ctx, id, body);
  });
}
