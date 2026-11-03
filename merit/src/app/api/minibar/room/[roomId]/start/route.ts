import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { startRoomCheck } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens the user's room check (drops the open checks the user left behind). */
export async function POST(_request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    return startRoomCheck(ctx, roomId);
  });
}
