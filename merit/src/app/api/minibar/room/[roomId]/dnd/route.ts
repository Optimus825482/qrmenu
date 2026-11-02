import { z } from "zod";
import { assertCan } from "@/lib/rbac";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { roomHotel, submitRoomDnd } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ note: z.string().max(300).optional() });

export async function POST(request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    const hotelId = await roomHotel(roomId);
    await assertCan(ctx, "MB-DND", "O", hotelId);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    return submitRoomDnd({
      hotelId,
      roomId,
      userId: ctx.user.id,
      note: parsed.success ? parsed.data.note : undefined,
    });
  });
}
