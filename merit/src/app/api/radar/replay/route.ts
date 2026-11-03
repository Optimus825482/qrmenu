import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { auditReplayOnce } from "@/modules/radar/server/replay/audit";
import { parseReplayQuery } from "@/modules/radar/server/replay/limits";
import { replayLines } from "@/modules/radar/server/replay/stream";
import { assertRadarScope } from "@/modules/radar/server/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" } as const;

function failure(error: DomainError): Response {
  return NextResponse.json({ ok: false, error: error.toResultError() }, { status: error.httpStatus, headers: HEADERS });
}

/**
 * GET /api/radar/replay?hotelId=&day=YYYY-MM-DD&from=HH:mm&to=HH:mm[&cursor=] — the day replay as NDJSON lines
 * (`ReplayLine`). `CR-RAD R` on the hotel is required (403 + YETKISIZ_DENEME otherwise); the replay is audited
 * once per user, hotel and day within 10 minutes. Validation errors answer 400 with a Turkish message.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const sp = new URL(request.url).searchParams;
    const now = new Date();
    const hotelId = sp.get("hotelId") ?? "";
    // Retention is a per-hotel setting; reading it for an unknown id is harmless (falls back to the default).
    const retention = hotelId ? await getSetting("radar.replayRetentionDays", hotelId) : 90;
    const q = parseReplayQuery(sp, now, retention);
    const layers = await assertRadarScope(ctx, q.hotelId, "R");
    // The first line is a snapshot, which needs the view right too: fail before the stream starts.
    await assertRadarScope(ctx, q.hotelId, "V");
    await auditReplayOnce(ctx, { hotelId: q.hotelId, day: q.day, from: q.fromTime, to: q.toTime }, now);

    const lines = replayLines(ctx, q, layers)[Symbol.asyncIterator]();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await lines.next();
          if (next.done) controller.close();
          else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
        } catch (error) {
          console.error("[radar replay]", error);
          controller.error(error);
        }
      },
      async cancel() {
        await lines.return?.(undefined);
      },
    });
    return new Response(body, {
      headers: { ...HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof DomainError) return failure(error);
    console.error("[radar replay]", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Beklenmeyen bir hata oluştu" } },
      { status: 500, headers: HEADERS },
    );
  }
}
