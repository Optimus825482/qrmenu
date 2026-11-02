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
  adjustHotelConsignmentStock,
  getHotelConsignmentStock,
  getHotelStockMovements,
} from "@/modules/minibar/server/depoService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(request.url).searchParams.get("hotelId"), "MB-ZIM", "V");
    const [stockItems, movements, hotels] = await Promise.all([
      getHotelConsignmentStock(hotelId),
      getHotelStockMovements(hotelId, 30),
      prisma.hotel.findMany({
        where: { isActive: true, id: { in: ctx.hotelIds } },
        select: { id: true, name: true, code: true },
      }),
    ]);
    return maskPrices({ stockItems, movements, hotels, selectedHotelId: hotelId }, canSeePrices(ctx));
  });
}

const bodySchema = z.object({
  productId: z.string().min(1).max(64),
  changeQuantity: z.number().int().min(-100000).max(100000),
  movementType: z.enum(["GIRIS", "DUZELTME"]).default("GIRIS"),
  note: z.string().max(300).optional(),
  formHotelId: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(request, bodySchema);
    // Entry = create (O), count correction = edit (D); the hotel selector value is authorised, not trusted.
    const hotelId = await selectHotel(
      ctx,
      body.formHotelId,
      "MB-ZIM",
      body.movementType === "GIRIS" ? "O" : "D",
    );
    return adjustHotelConsignmentStock({
      hotelId,
      productId: body.productId,
      changeQuantity: body.changeQuantity,
      movementType: body.movementType,
      note: body.note,
      userId: ctx.user.id,
    });
  });
}
