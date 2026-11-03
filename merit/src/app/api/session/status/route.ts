import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/session/status -> `{ expiresAt, now }` (ISO). The staff shell polls it once a minute while
 * visible: `expiresAt` feeds the "Oturum 42 dk sonra kapanacak" strip, `now` corrects the device clock.
 */
export async function GET() {
  try {
    const ctx = await requireUser();
    const session = await prisma.userSession.findUnique({ where: { id: ctx.session.id }, select: { expiresAt: true } });
    if (!session) return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 401 });
    return NextResponse.json(
      { expiresAt: session.expiresAt.toISOString(), now: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      return NextResponse.json({ error: error.message }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    throw error;
  }
}
