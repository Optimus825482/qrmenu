import { z } from "zod";
import { handle, parseBody, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { setOpeningStock } from "@/modules/minibar/server/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z
  .object({
    productId: z.string().min(1).max(64),
    qty: z.number().int().min(0).max(100000),
    formHotelId: z.string().max(64).optional(),
  })
  .strict();

/** Corrects the opening quantity of one product (stock managers, during the first week). */
export async function PUT(request: Request) {
  return handle(async (ctx) => {
    const input = await parseBody(request, body);
    const hotelId = await selectHotel(ctx, input.formHotelId, "MB-ZIM", "D");
    const row = await setOpeningStock(ctx, hotelId, { productId: input.productId, qty: input.qty });
    return { success: true, productId: row.productId, openingQty: row.openingQty, remainingQty: row.remainingQty };
  });
}
