import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveCorrectionRequest } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await props.params;
    let approverId = "system";

    try {
      const ctx = await requireUser();
      approverId = ctx.user.id;
    } catch {
      const u = await prisma.user.findFirst({ where: { isActive: true } });
      if (u) approverId = u.id;
    }

    const body = await request.json();
    const { approved, rejectReason } = body;

    const result = await resolveCorrectionRequest({
      requestId,
      approverId,
      approved: Boolean(approved),
      rejectReason,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Talep sonuçlandırılırken hata oluştu.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
