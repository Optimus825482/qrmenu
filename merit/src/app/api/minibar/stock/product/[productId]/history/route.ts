import { prisma } from "@/lib/prisma";
import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { productHistory, stockHotel } from "@/modules/minibar/server/stockViews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ productId: string }> }) {
  return handle(async (ctx) => {
    const { productId } = await props.params;
    const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
    // The permission check lives in productHistory; the heading data is read only after it passed.
    const history = await productHistory(ctx, productId, Number.isFinite(days) ? days : 30);
    const [product, stock, hotel] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId }, select: { name: true, group: { select: { name: true } } } }),
      prisma.hotelStock.findUnique({
        where: { hotelId_productId: { hotelId: ctx.session.hotelId, productId } },
        select: { remainingQty: true },
      }),
      stockHotel(ctx),
    ]);
    return {
      ...history,
      product: product ? { name: product.name, groupName: product.group.name, remaining: stock?.remainingQty ?? null } : null,
      hotel,
    };
  });
}
