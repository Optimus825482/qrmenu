import { handle } from "@/modules/minibar/server/apiAuthHelper";
import { exportStockXlsx } from "@/modules/minibar/server/stockViews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async (ctx) => {
    const { fileName, data } = await exportStockXlsx(ctx);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  });
}
