import { requireUser } from "@/lib/auth";
import type { UserAuditCtx } from "./minibarDefinitionsService";

export async function getAuditCtxFromRequest(req: Request): Promise<UserAuditCtx> {
  let userId: string | undefined;
  let hotelId: string | undefined;

  try {
    const ctx = await requireUser();
    userId = ctx.user.id;
    hotelId = ctx.session.hotelId || ctx.user.hotelId;
  } catch {
    // Non-authenticated fallback for demo / internal calls
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : realIp || "127.0.0.1";

  return { userId, hotelId, ip };
}
