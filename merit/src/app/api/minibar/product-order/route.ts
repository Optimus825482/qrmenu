import { DomainError } from "@/lib/result";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { productOrderView, resetProductOrder, saveProductOrder } from "@/modules/minibar/server/productOrder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Oda kontrol ürün sıralaması of the signed-in user: read, save, back to standard. */
export async function GET() {
  return handle((ctx) => productOrderView(ctx));
}

export async function PUT(request: Request) {
  return handle(async (ctx) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new DomainError("VALIDATION", "Geçersiz istek gövdesi");
    }
    return { success: true, ...(await saveProductOrder(ctx, body)) };
  });
}

export async function DELETE() {
  return handle(async (ctx) => ({ success: true, ...(await resetProductOrder(ctx)) }));
}
