import { z } from "zod";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { recordNoConsumption } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ clientRequestId: z.uuid() });

/** "Sarfiyat Yok": the room's minibar is complete. */
export async function POST(request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    const body = await parseBody(request, bodySchema);
    return recordNoConsumption(ctx, { roomId, ...body });
  });
}
