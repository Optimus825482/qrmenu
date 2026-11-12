import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
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
  countPool,
  isStockManager,
  listExpiry,
  listMovements,
  listOpeningStock,
  listPoolAll,
  openingStockWindow,
  returnFromPool,
  setCriticalLevel,
} from "@/modules/minibar/server/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MOVEMENTS_PAGE_SIZE = 50;

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const params = new URL(request.url).searchParams;
    const hotelId = await selectHotel(ctx, params.get("hotelId"), "MB-ZIM", "V");
    // Movement history is paged (newest first); `movementsPage` asks for older pages.
    const page = Math.min(Math.max(Math.trunc(Number(params.get("movementsPage") ?? 1)) || 1, 1), 10_000);
    const [rows, moves, hotels, canCount, expiry, openingQty, opening] = await Promise.all([
      listPoolAll(ctx, hotelId, { includeEmpty: true }),
      listMovements(ctx, hotelId, { page, pageSize: MOVEMENTS_PAGE_SIZE }),
      prisma.hotel.findMany({
        where: { isActive: true, ...(ctx.user.roleKind === "SISTEM" ? {} : { id: { in: ctx.hotelIds } }) },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      // Count corrections: MB-ZIM A held by a system or minibar role (pool.countPool).
      ctx.user.roleKind === "SISTEM" || ctx.user.roleKind === "MINIBAR" ? can(ctx, "MB-ZIM", "A", hotelId) : false,
      listExpiry(ctx, hotelId),
      listOpeningStock(ctx, hotelId),
      openingStockWindow(),
    ]);
    // Stock managers (minibar operasyonları sistem sorumlusu) add stock and correct the opening quantities.
    const canManage = isStockManager(ctx) && (await can(ctx, "MB-ZIM", "O", hotelId));
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
        productActive: r.productActive,
        openingQty: openingQty[r.productId] ?? null,
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
    return maskPrices(
      {
        stockItems,
        movements,
        movementsTotal: moves.total,
        movementsPage: page,
        movementsPageSize: MOVEMENTS_PAGE_SIZE,
        hotels,
        selectedHotelId: hotelId,
        canCount,
        canManage,
        expiry,
        opening: opening ? { ...opening, canEdit: canManage && opening.open } : null,
      },
      canSeePrices(ctx),
    );
  });
}

const bodySchema = z.object({
  productId: z.string().min(1).max(64),
  changeQuantity: z.number().int().min(-100000).max(100000).optional(),
  /** DUZELTME as a stock count: the counted quantity; the server books the difference. */
  countedQty: z.number().int().min(0).max(100000).optional(),
  movementType: z.enum(["GIRIS", "IADE", "DUZELTME"]).default("GIRIS"),
  note: z.string().max(300).optional(),
  formHotelId: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(request, bodySchema);
    // Entry and return = create (O), correction = approve (A, system and warehouse roles); the hotel selector is authorised, not trusted.
    const hotelId = await selectHotel(
      ctx,
      body.formHotelId,
      "MB-ZIM",
      body.movementType === "DUZELTME" ? "A" : "O",
    );
    const note = body.note?.trim() || undefined;
    const qty = body.changeQuantity ?? 0;
    if (body.movementType === "GIRIS") {
      await addToPool(ctx, hotelId, { productId: body.productId, qty, note });
    } else if (body.movementType === "IADE") {
      await returnFromPool(ctx, hotelId, { productId: body.productId, qty: Math.abs(qty), note });
    } else if (body.countedQty !== undefined) {
      const row = await countPool(ctx, hotelId, { productId: body.productId, countedQty: body.countedQty, reason: note ?? "" });
      return {
        success: true,
        message: `Sayım kaydedildi: fark ${row.delta > 0 ? "+" : ""}${row.delta} adet, yeni stok ${row.remainingQty} adet.`,
      };
    } else {
      await adjustPool(ctx, hotelId, { productId: body.productId, delta: qty, reason: note ?? "" });
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
