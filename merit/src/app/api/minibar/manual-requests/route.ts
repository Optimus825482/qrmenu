import { DomainError } from "@/lib/result";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import {
  createManualEntryRequest,
  listManualEntryRequests,
  manualEntryLines,
  manualEntryRooms,
} from "@/modules/minibar/server/manualEntryRequests";
import { isStockManager } from "@/modules/minibar/server/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** With `roomId`: the products of that room. Without: floors and rooms, the visible requests, who may decide. */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const roomId = new URL(request.url).searchParams.get("roomId");
    if (roomId) return { lines: await manualEntryLines(ctx, roomId) };
    const canDecide = isStockManager(ctx);
    // A manager who is not a floor attendant may have no room-check right: the form is then simply absent.
    const rooms = await manualEntryRooms(ctx).catch((error) => {
      if (error instanceof DomainError && error.code === "FORBIDDEN") return null;
      throw error;
    });
    return { floors: rooms?.floors ?? [], canCreate: rooms !== null, canDecide, userId: ctx.user.id, requests: await listManualEntryRequests(ctx) };
  });
}

export async function POST(request: Request) {
  return handle(async (ctx) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new DomainError("VALIDATION", "Geçersiz istek gövdesi");
    }
    return { success: true, ...(await createManualEntryRequest(ctx, body)) };
  });
}
