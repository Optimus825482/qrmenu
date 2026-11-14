import { requireUser } from "@/lib/auth";
import { isListening, startRealtimeListener } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { createSseStream, seesStaffNames, withoutStaffNames } from "@/lib/sse";
import { sseCoverage } from "@/modules/order/server/roomService/coverageAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof DomainError && err.code === "UNAUTHORIZED") {
      return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    throw err;
  }

  // Normally started by instrumentation; covers dev setups where it did not run.
  if (!isListening()) await startRealtimeListener();

  const stream = createSseStream(
    {
      userId: ctx.user.id,
      sessionId: ctx.session.id,
      hotelIds: ctx.hotelIds,
      outletId: ctx.session.outletId,
      roleKind: ctx.user.roleKind,
    },
    {
      signal: request.signal,
      // Staff names stay out of the stream of roles that may not read them.
      ...(seesStaffNames(ctx.user.roleKind) ? {} : { map: withoutStaffNames }),
      // Cross-hotel room-service coverage, gated exactly like the covered board (RO-TAL view at home, home desk,
      // hotels outside the session scope); re-read on change and on a short interval (lib/sse.ts).
      loadCoverage: () => sseCoverage(ctx),
    },
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

/**
 * Session probe for the client after a dropped stream (sseStore): 204 while the session is valid,
 * 401 once it is not, without opening a stream. Lets the tab leave for /giris when it missed the
 * `session.closed` frame.
 */
export async function HEAD(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    await requireUser();
    return new Response(null, { status: 204, headers });
  } catch (err) {
    if (err instanceof DomainError && err.code === "UNAUTHORIZED") {
      return new Response(null, { status: 401, headers });
    }
    throw err;
  }
}
