import { z } from "zod";
import { assertCan } from "@/lib/rbac";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { roomHotel, submitRoomCheck } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  consumedItems: z
    .array(
      z.object({
        productId: z.string().min(1).max(64),
        qty: z.number().int().min(0).max(99),
        setupId: z.string().min(1).max(64).optional(),
      }),
    )
    .max(200)
    .default([]),
  note: z.string().max(500).optional(),
  clientRequestId: z.uuid().optional(),
});

export async function POST(request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    const hotelId = await roomHotel(roomId);
    await assertCan(ctx, "MB-TUK", "O", hotelId);
    const body = await parseBody(request, bodySchema);
    return submitRoomCheck({ hotelId, roomId, userId: ctx.user.id, ...body });
  });
}
