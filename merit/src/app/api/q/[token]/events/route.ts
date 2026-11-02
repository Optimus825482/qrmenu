import { isListening, startRealtimeListener } from "@/lib/realtime";
import { createFilteredSseStream } from "@/lib/sse";
import { guestEventFilter, sanitizeGuestEvent } from "@/modules/menu/guestEventFilter";
import {
  globalUnknownTokenLimiter,
  guestMeta,
  resolveGuestTokenLimited,
  unknownTokenLimiter,
} from "@/modules/menu/server/guestToken";
import { roomServiceState } from "@/modules/order/server/roomService/roomState";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ORDERS = 20;
const ID_FORMAT = /^[A-Za-z0-9_-]{1,64}$/;
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The guest SSE stream of a table: menu availability / menu / price / ordering changes of its outlet
 * and the status events of the orders named in `?orders=id1,id2`. No session: the table token is the
 * credential. A token that is not a usable table answers 404 (429 when rate limited, 503 on a lookup
 * failure); the stream never carries other outlets' events or recipient ids.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const target = await resolveGuestTokenLimited(
    token,
    guestMeta(request.headers),
    unknownTokenLimiter,
    globalUnknownTokenLimiter,
    { log: false }, // a (re)connect is not a scan
  );
  if (target.kind === "NONE") {
    if (target.reason === "RATE_LIMITED") {
      return new Response("Too Many Requests", { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } });
    }
    if (target.reason === "HATA") {
      return new Response("Service Unavailable", { status: 503, headers: { ...NO_STORE, "Retry-After": "5" } });
    }
  }
  if (target.kind !== "TABLE" && target.kind !== "ROOM") {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  let outletId: string;
  let hotelId: string;

  if (target.kind === "TABLE") {
    outletId = target.state.outletId;
    hotelId = target.state.hotelId;
  } else {
    const rsState = await roomServiceState(target.roomId);
    if (!rsState.rsOutletId) {
      return new Response("Not found", { status: 404, headers: NO_STORE });
    }
    outletId = rsState.rsOutletId;
    hotelId = rsState.hotelId;
  }

  const orderIds = (new URL(request.url).searchParams.get("orders") ?? "")
    .split(",")
    .filter((id) => ID_FORMAT.test(id))
    .slice(0, MAX_ORDERS);

  // Normally started by instrumentation; covers dev setups where it did not run.
  if (!isListening()) await startRealtimeListener();

  const stream = createFilteredSseStream(
    guestEventFilter({ outletId, hotelId, orderIds }),
    { signal: request.signal, map: sanitizeGuestEvent },
  );
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
