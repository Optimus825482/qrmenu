import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { resolveCorrectionRequest } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  approved: z.boolean(),
  rejectReason: z.string().max(500).optional(),
});

/** Decided by the system administrator only (MB-TUK A + SISTEM, enforced in the service). */
export async function POST(request: Request, props: { params: Promise<{ requestId: string }> }) {
  return handle(async (ctx) => {
    const { requestId } = await props.params;
    const body = await parseBody(request, bodySchema);
    return resolveCorrectionRequest(ctx, { requestId, ...body });
  });
}
