import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  deleteRoomCheckToday,
  updateRoomCheckToday,
} from "@/modules/minibar/server/minibarService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  props: { params: Promise<{ txId: string }> }
) {
  try {
    const { txId } = await props.params;
    let userId = "system";
    let hotelId: string | null = null;

    try {
      const ctx = await requireUser();
      userId = ctx.user.id;
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      const u = await prisma.user.findFirst({ where: { isActive: true } });
      if (u) userId = u.id;
    }

    if (!hotelId) {
      const tx = await prisma.minibarTransaction.findUnique({
        where: { id: txId },
        select: { hotelId: true },
      });
      hotelId = tx?.hotelId || null;
    }

    if (!hotelId) {
      return NextResponse.json({ error: "İşlem veya otel bulunamadı." }, { status: 404 });
    }

    const result = await deleteRoomCheckToday({
      transactionId: txId,
      userId,
      hotelId,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Silme işlemi sırasında hata oluştu.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ txId: string }> }
) {
  try {
    const { txId } = await props.params;
    let userId = "system";
    let hotelId: string | null = null;

    try {
      const ctx = await requireUser();
      userId = ctx.user.id;
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      const u = await prisma.user.findFirst({ where: { isActive: true } });
      if (u) userId = u.id;
    }

    if (!hotelId) {
      const tx = await prisma.minibarTransaction.findUnique({
        where: { id: txId },
        select: { hotelId: true },
      });
      hotelId = tx?.hotelId || null;
    }

    if (!hotelId) {
      return NextResponse.json({ error: "İşlem veya otel bulunamadı." }, { status: 404 });
    }

    const body = await request.json();
    const updatedItems: { productId: string; qty: number }[] = body.updatedItems || [];
    const note: string | undefined = body.note;

    const result = await updateRoomCheckToday({
      transactionId: txId,
      userId,
      hotelId,
      updatedItems,
      note,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Güncelleme sırasında hata oluştu.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
