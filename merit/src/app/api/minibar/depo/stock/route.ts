import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getHotelConsignmentStock,
  adjustHotelConsignmentStock,
  getHotelStockMovements,
} from "@/modules/minibar/server/depoService";
import { StockMovementType } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    let hotelId: string | null = null;
    try {
      const ctx = await requireUser();
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      // Fallback
    }

    const { searchParams } = new URL(request.url);
    const paramHotelId = searchParams.get("hotelId");
    if (paramHotelId) hotelId = paramHotelId;

    if (!hotelId) {
      const firstHotel = await prisma.hotel.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      hotelId = firstHotel?.id || null;
    }

    if (!hotelId) {
      return NextResponse.json({ error: "Otel bulunamadı." }, { status: 404 });
    }

    const [stockItems, movements, hotels] = await Promise.all([
      getHotelConsignmentStock(hotelId),
      getHotelStockMovements(hotelId, 30),
      prisma.hotel.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
      }),
    ]);

    return NextResponse.json({
      stockItems,
      movements,
      hotels,
      selectedHotelId: hotelId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stok bilgisi alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let userId: string | null = null;
    let hotelId: string | null = null;

    try {
      const ctx = await requireUser();
      userId = ctx.user.id;
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      // Fallback
    }

    const body = await request.json();
    const { productId, changeQuantity, movementType, note, formHotelId } = body;

    if (formHotelId) hotelId = formHotelId;

    if (!hotelId) {
      const firstHotel = await prisma.hotel.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      hotelId = firstHotel?.id || null;
    }

    if (!hotelId) {
      return NextResponse.json({ error: "Otel bulunamadı." }, { status: 400 });
    }

    if (!productId || typeof changeQuantity !== "number") {
      return NextResponse.json({ error: "Eksik parametreler (productId, changeQuantity)." }, { status: 400 });
    }

    if (!userId) {
      const defaultUser = await prisma.user.findFirst({
        where: { role: { name: { in: ["DEPO_SORUMLUSU", "SYSTEM_ADMIN", "KAT_SORUMLUSU"] } } },
        select: { id: true },
      });
      userId = defaultUser?.id || "system";
    }

    const validMovementType: StockMovementType =
      movementType === "DUZELTME" ? "DUZELTME" : "GIRIS";

    const result = await adjustHotelConsignmentStock({
      hotelId,
      productId,
      changeQuantity,
      movementType: validMovementType,
      note,
      userId,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stok güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
