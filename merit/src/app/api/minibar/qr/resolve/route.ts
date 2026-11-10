import { z } from "zod";
import { clientIp } from "@/lib/rate-limit";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { manualEntryInfo, resolveRoomByQr } from "@/modules/minibar/server/roomScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.strictObject({ text: z.string().max(2000) });

/** Whether the reader page offers the typed room number field (manual entry) in the session hotel. */
export async function GET() {
  return handle((ctx) => manualEntryInfo(ctx));
}

/** Resolves a scanned QR text or a typed code to a room of the user's hotels. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const { text } = await parseBody(request, bodySchema);
    return resolveRoomByQr(ctx, text, {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    });
  });
}
