import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { getRoomCheckView } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    return getRoomCheckView(ctx, roomId);
  });
}
