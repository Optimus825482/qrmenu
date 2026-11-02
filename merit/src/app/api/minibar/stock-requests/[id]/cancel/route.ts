import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { cancelRequest } from "@/modules/minibar/server/stockRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().max(500).optional() });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const { id } = await props.params;
    const raw = await request.text();
    const body = raw ? await parseBody(new Request(request.url, { method: "POST", body: raw }), bodySchema) : {};
    return cancelRequest(ctx, id, body.reason);
  });
}
