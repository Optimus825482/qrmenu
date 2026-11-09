import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { getRoomDndDetails, markDnd } from "@/modules/minibar/server/dnd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    return getRoomDndDetails(ctx, roomId);
  });
}

export async function POST(request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    const raw: unknown = await request.json().catch(() => ({}));
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return markDnd(ctx, { ...body, roomId });
  });
}
