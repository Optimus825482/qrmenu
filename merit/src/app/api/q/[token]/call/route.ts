import { guestResult, readJsonBody } from "@/lib/guest-api";
import { clientIp } from "@/lib/rate-limit";
import { waiterCalls } from "@/modules/order/server/waiterCalls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A waiter / bill call from the table. The table token is the credential. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return guestResult(async () => {
    const body = await readJsonBody(request);
    return waiterCalls.createFromGuest({
      token,
      type: typeof body.type === "string" ? (body.type as never) : undefined,
      optionId: typeof body.optionId === "string" ? body.optionId : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    });
  });
}
