import { DomainError } from "@/lib/result";
import { errorResponse, gatewayAuthorized, unauthorized } from "@/lib/gateway-auth";
import { printers, type HeartbeatPrinter } from "@/modules/order/server/printers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Gateway heartbeat: stamps printer states and answers with the hotel's active printers
 * (`{ printers: [{ id, ip, port }] }`) so the gateway knows what to TCP-ping next.
 */
export async function POST(request: Request): Promise<Response> {
  if (!gatewayAuthorized(request)) return unauthorized();
  try {
    const body = (await request.json().catch(() => null)) as
      | { hotel?: unknown; printers?: unknown }
      | null;
    if (!body || typeof body.hotel !== "string" || !Array.isArray(body.printers)) {
      throw new DomainError("VALIDATION", "Gövde { hotel, printers } olmalı");
    }
    await printers.heartbeat(body.hotel, body.printers as HeartbeatPrinter[]);
    return Response.json({ printers: await printers.listActive(body.hotel) });
  } catch (error) {
    return errorResponse(error);
  }
}
