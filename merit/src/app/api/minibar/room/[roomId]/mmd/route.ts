import { z } from "zod";
import { assertCan } from "@/lib/rbac";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { roomHotel, submitRoomMmd } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().trim().min(1, "MMD nedeni belirtilmedi.").max(120),
  note: z.string().max(300).optional(),
});

export async function POST(request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    const hotelId = await roomHotel(roomId);
    await assertCan(ctx, "MB-TUK", "O", hotelId);
    const body = await parseBody(request, bodySchema);
    return submitRoomMmd({ hotelId, roomId, userId: ctx.user.id, ...body });
  });
}
