import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { isStockManager, openingStockWindow } from "@/modules/minibar/server/pool";
import { createReceipt, listReceipts, receiptHotels, receiptProducts } from "@/modules/minibar/server/receipts";
import { DomainError } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the delivery screen needs: hotels, products, past deliveries (stock managers only). */
export async function GET() {
  return handle(async (ctx) => {
    if (!isStockManager(ctx)) throw new DomainError("FORBIDDEN", "Bu ekranı yalnızca minibar operasyonları sistem sorumlusu açabilir");
    const [hotels, products, receipts, opening] = await Promise.all([
      receiptHotels(ctx),
      receiptProducts(),
      listReceipts(ctx),
      openingStockWindow(),
    ]);
    return { hotels, products, receipts, opening };
  });
}

export async function POST(request: Request) {
  return handle(async (ctx) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new DomainError("VALIDATION", "Geçersiz istek gövdesi");
    }
    const receipt = await createReceipt(ctx, body);
    return { success: true, ...receipt };
  });
}
