import { clientIp } from "@/lib/rate-limit";
import { guestResult, readJsonBody } from "@/lib/guest-api";
import { DomainError } from "@/lib/result";
import { guestMeta } from "@/modules/menu/server/guestToken";
import { guestOrder } from "@/modules/order/server/guestOrder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Creates a table order from the guest's selections. The table token is the credential. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return guestResult(async () => {
    const body = await readJsonBody(request);
    return guestOrder.create({
      token,
      idempotencyKey: body.idempotencyKey as string,
      items: body.items as never,
      note: typeof body.note === "string" ? body.note : undefined,
      locale: typeof body.locale === "string" ? body.locale : undefined,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    });
  });
}

/** The status of one of the table's own orders (another table's order is NOT_FOUND). */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return guestResult(async () => {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new DomainError("VALIDATION", "Sipariş kimliği gerekli");
    return guestOrder.get(token, id, guestMeta(request.headers));
  });
}
