import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { listStockCorrections } from "@/modules/minibar/server/stockCorrections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Waiting and recently resolved stock correction requests (system administrator / minibar system manager). */
export async function GET(request: Request) {
  return handle((ctx) => listStockCorrections(ctx, new URL(request.url).searchParams.get("hotelId") || undefined));
}
