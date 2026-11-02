import { clientIp } from "@/lib/rate-limit";
import { guestResult, readJsonBody } from "@/lib/guest-api";
import { DomainError } from "@/lib/result";
import { guestMeta, resolveGuestTokenLimited } from "@/modules/menu/server/guestToken";
import { guestOrder } from "@/modules/order/server/guestOrder";
import { roomOrder } from "@/modules/order/server/roomService/roomOrder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Creates a table or room service order from the guest's selections. The QR token is the credential. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return guestResult(async () => {
    const meta = guestMeta(request.headers);
    const target = await resolveGuestTokenLimited(token, meta, undefined, undefined, { log: false });
    const body = await readJsonBody(request);
    const input = {
      token,
      idempotencyKey: body.idempotencyKey as string,
      items: body.items as never,
      note: typeof body.note === "string" ? body.note : undefined,
      locale: typeof body.locale === "string" ? body.locale : undefined,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    };

    if (target.kind === "TABLE") {
      return guestOrder.create(input);
    }
    if (target.kind === "ROOM") {
      return roomOrder.create(input);
    }
    if (target.kind === "NONE" && target.reason === "RATE_LIMITED") {
      throw new DomainError("RATE_LIMITED", "Çok fazla deneme, biraz sonra tekrar deneyin");
    }
    throw new DomainError("NOT_FOUND", "Geçersiz veya süresi dolmuş kod");
  });
}

/** The status of one order belonging to the guest token (another table/room order is NOT_FOUND). */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return guestResult(async () => {
    const meta = guestMeta(request.headers);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new DomainError("VALIDATION", "Sipariş kimliği gerekli");

    const target = await resolveGuestTokenLimited(token, meta, undefined, undefined, { log: false });
    if (target.kind === "TABLE") {
      return guestOrder.get(token, id, meta);
    }
    if (target.kind === "ROOM") {
      return roomOrder.get(token, id, meta);
    }
    if (target.kind === "NONE" && target.reason === "RATE_LIMITED") {
      throw new DomainError("RATE_LIMITED", "Çok fazla deneme, biraz sonra tekrar deneyin");
    }
    throw new DomainError("NOT_FOUND", "Geçersiz veya süresi dolmuş kod");
  });
}
