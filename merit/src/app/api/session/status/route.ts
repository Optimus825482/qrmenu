import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/session/status -> `{ expiresAt, now }` (ISO). The staff shell polls it while
 * visible: `expiresAt` feeds the "Oturum 5 dk sonra kapanacak" strip, `now` corrects the device clock.
 */
export async function GET() {
  try {
    const ctx = await requireUser();
    const [session, idleMinutes] = await Promise.all([
      prisma.userSession.findUnique({
        where: { id: ctx.session.id },
        select: { expiresAt: true, lastSeenAt: true },
      }),
      getSetting("session.idleMinutes", ctx.session.hotelId),
    ]);
    if (!session) return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 401 });
    const idleClose = new Date(session.lastSeenAt.getTime() + idleMinutes * 60_000);
    const effectiveExpires = session.expiresAt < idleClose ? session.expiresAt : idleClose;
    return NextResponse.json(
      { expiresAt: effectiveExpires.toISOString(), now: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ error: error.message }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    throw error;
  }
}
