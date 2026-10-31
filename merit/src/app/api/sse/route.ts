import { requireUser } from "@/lib/auth";
import { isListening, startRealtimeListener } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { createSseStream } from "@/lib/sse";

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
    { signal: request.signal },
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
