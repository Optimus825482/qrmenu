import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { deliverRequest } from "@/modules/minibar/server/stockRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ items: z.array(z.object({ itemId: z.string().min(1), deliveredQty: z.number() })).max(100) });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  return handle(async (ctx) => {
    const { id } = await props.params;
    const body = await parseBody(request, bodySchema);
    return deliverRequest(ctx, id, body.items);
  });
}
