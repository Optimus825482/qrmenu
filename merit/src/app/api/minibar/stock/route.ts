import { z } from "zod";
import { can } from "@/lib/rbac";
import { handle, parseBody } from "@/modules/minibar/server/apiAuthHelper";
import { setCriticalLevel } from "@/modules/minibar/server/pool";
import { criticalStocks, myStock } from "@/modules/minibar/server/stockViews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The session hotel's pool; `?view=critical` returns the grouped critical list instead. */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const view = new URL(request.url).searchParams.get("view");
    if (view === "critical") return criticalStocks(ctx);
    const [data, canEditCritical] = await Promise.all([
      myStock(ctx),
      can(ctx, "MB-ZIM", "D", ctx.session.hotelId),
    ]);
    return { ...data, canEditCritical };
  });
}

const bodySchema = z.object({ productId: z.string().min(1).max(64), level: z.number() }).strict();

export async function PATCH(request: Request) {
  return handle(async (ctx) => {
    const input = await parseBody(request, bodySchema);
    await setCriticalLevel(ctx, ctx.session.hotelId, input);
    return { productId: input.productId, level: input.level };
  });
}
