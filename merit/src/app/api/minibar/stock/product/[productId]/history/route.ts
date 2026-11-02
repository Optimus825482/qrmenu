import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { productHistory } from "@/modules/minibar/server/stockViews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ productId: string }> }) {
  return handle(async (ctx) => {
    const { productId } = await props.params;
    const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
    return productHistory(ctx, productId, Number.isFinite(days) ? days : 30);
  });
}
