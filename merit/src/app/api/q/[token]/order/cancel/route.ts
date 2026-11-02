import { guestResult, readJsonBody } from "@/lib/guest-api";
import { DomainError } from "@/lib/result";
import { guestMeta, resolveGuestTokenLimited } from "@/modules/menu/server/guestToken";
import { roomOrder } from "@/modules/order/server/roomService/roomOrder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Guest cancel: only available for room service orders before approval. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return guestResult(async () => {
    const meta = guestMeta(request.headers);
    const target = await resolveGuestTokenLimited(token, meta, undefined, undefined, { log: false });
    if (target.kind !== "ROOM") {
      throw new DomainError("NOT_FOUND", "İptal işlemi yalnız oda servisi için geçerlidir");
    }

    const body = await readJsonBody(request);
    const orderId = body.orderId;
    if (typeof orderId !== "string" || !orderId.trim()) {
      throw new DomainError("VALIDATION", "Sipariş kimliği gerekli");
    }

    return roomOrder.guestCancel(token, orderId.trim(), meta);
  });
}
