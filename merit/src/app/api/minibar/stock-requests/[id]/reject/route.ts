import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { rejectRequest } from "@/modules/minibar/server/stockRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().max(500) });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const { id } = await props.params;
    const body = await parseBody(request, bodySchema);
    return rejectRequest(ctx, id, body.reason);
  });
}
