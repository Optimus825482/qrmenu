import { z } from "zod";
import { clientIp } from "@/lib/rate-limit";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { resolveRoomByQr } from "@/modules/minibar/server/roomScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.strictObject({ text: z.string().max(2000) });

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
