import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPastDateCorrectionRequest } from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let requestedById = "system";
    let hotelId: string | null = null;

    try {
      const ctx = await requireUser();
      requestedById = ctx.user.id;
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      const u = await prisma.user.findFirst({ where: { isActive: true } });
      if (u) requestedById = u.id;
    }

    const body = await request.json();
    const { transactionId, actionType, reason, proposedData } = body;

    if (!transactionId || !actionType || !reason) {
      return NextResponse.json(
        { error: "İşlem ID, talep türü ve gerekçe açıklaması zorunludur." },
        { status: 400 }
      );
    }

    if (!hotelId) {
      const tx = await prisma.minibarTransaction.findUnique({
        where: { id: transactionId },
        select: { hotelId: true },
      });
      hotelId = tx?.hotelId || null;
    }

    if (!hotelId) {
      return NextResponse.json({ error: "Otel veya işlem kaydı bulunamadı." }, { status: 404 });
    }

    const result = await createPastDateCorrectionRequest({
      transactionId,
      requestedById,
      hotelId,
      actionType,
      reason,
      proposedData,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Düzeltme talebi oluşturulurken hata oluştu.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
