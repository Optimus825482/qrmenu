import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  canSeePrices,
  handle,
  maskPrices,
  parseBody,
  selectHotel,
} from "@/modules/minibar/server/apiAuthHelper";
import {
  addToPool,
  adjustPool,
  listMovements,
  listPoolAll,
  returnFromPool,
  setCriticalLevel,
} from "@/modules/minibar/server/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(request.url).searchParams.get("hotelId"), "MB-ZIM", "V");
    const [rows, moves, hotels] = await Promise.all([
      listPoolAll(ctx, hotelId, { includeEmpty: true }),
      listMovements(ctx, hotelId, { page: 1, pageSize: 50 }),
      prisma.hotel.findMany({
        where: { isActive: true, ...(ctx.user.roleKind === "SISTEM" ? {} : { id: { in: ctx.hotelIds } }) },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
    ]);
    // The old field names stay (the page reads them); `status` and `criticalLevel` are new.
    const stockItems = rows
      .map((r) => ({
        id: r.id ?? `new-${r.productId}`,
        productId: r.productId,
        productName: r.productName,
        categoryName: r.groupName,
        price: 0, // the pool carries no price; kept for the old page shape
        currency: "TL",
        quantity: r.remainingQty,
        minLevel: r.criticalLevel,
        criticalLevel: r.criticalLevel,
        status: r.status,
        lastUpdated: r.updatedAt ?? new Date().toISOString(),
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName, "tr") || a.productName.localeCompare(b.productName, "tr"));
    const movements = moves.items.map((m) => ({
      id: m.id,
      productName: m.productName,
      type: m.type,
      quantity: m.qty,
      note: m.note,
      userName: m.userName,
      createdAt: m.at,
    }));
    return maskPrices({ stockItems, movements, hotels, selectedHotelId: hotelId }, canSeePrices(ctx));
  });
}

const bodySchema = z.object({
  productId: z.string().min(1).max(64),
  changeQuantity: z.number().int().min(-100000).max(100000),
  movementType: z.enum(["GIRIS", "IADE", "DUZELTME"]).default("GIRIS"),
  note: z.string().max(300).optional(),
  formHotelId: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(request, bodySchema);
    // Entry and return = create (O), correction = approve (A, system roles only); the hotel selector is authorised, not trusted.
    const hotelId = await selectHotel(
      ctx,
      body.formHotelId,
      "MB-ZIM",
      body.movementType === "DUZELTME" ? "A" : "O",
    );
    const note = body.note?.trim() || undefined;
    if (body.movementType === "GIRIS") {
      await addToPool(ctx, hotelId, { productId: body.productId, qty: body.changeQuantity, note });
    } else if (body.movementType === "IADE") {
      await returnFromPool(ctx, hotelId, { productId: body.productId, qty: Math.abs(body.changeQuantity), note });
    } else {
      await adjustPool(ctx, hotelId, { productId: body.productId, delta: body.changeQuantity, reason: note ?? "" });
    }
    return { success: true, message: "Stok başarıyla güncellendi." };
  });
}

const levelBody = z
  .object({
    productId: z.string().min(1).max(64),
    level: z.number().int().min(0).max(100000),
    formHotelId: z.string().max(64).optional(),
  })
  .strict();

export async function PATCH(request: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(request, levelBody);
    const hotelId = await selectHotel(ctx, body.formHotelId, "MB-ZIM", "D");
    await setCriticalLevel(ctx, hotelId, { productId: body.productId, level: body.level });
    return { productId: body.productId, level: body.level };
  });
}
