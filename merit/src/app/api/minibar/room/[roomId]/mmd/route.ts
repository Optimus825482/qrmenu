import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { recordMmd, roomMmdsToday } from "@/modules/minibar/server/mmd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's MMD (misafir müsait değil) records of the room. */
export async function GET(_request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    return roomMmdsToday(ctx, roomId);
  });
}

export async function POST(request: Request, props: { params: Promise<{ roomId: string }> }) {
  return handle(async (ctx) => {
    const { roomId } = await props.params;
    const raw: unknown = await request.json().catch(() => ({}));
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return recordMmd(ctx, { ...body, roomId });
  });
}
