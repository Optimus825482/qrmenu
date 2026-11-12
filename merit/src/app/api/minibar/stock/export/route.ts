import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { exportStockXlsx } from "@/modules/minibar/server/stockViews";
import { stockViewFromQuery } from "@/modules/minibar/stockView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The stock list as Excel: the rows the screen shows under the filter and order in the query, all pages of them. */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const view = stockViewFromQuery(new URL(request.url).searchParams);
    const { fileName, data } = await exportStockXlsx(ctx, new Date(), view);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  });
}
