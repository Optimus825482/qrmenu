import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { parsePrintTemplate, parsePrintTheme } from "@/modules/menu/server/printOptions";
import * as tableQr from "@/modules/menu/server/tableQr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/qr/outlet/{id}/print — printable card sheet (QM-MEN view); opened in a new tab. */
export async function GET(request: Request, { params }: { params: Promise<{ outletId: string }> }): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { outletId } = await params;
    const url = new URL(request.url);
    const areaId = url.searchParams.get("areaId") || undefined;
    const tableId = url.searchParams.get("tableId") || undefined;
    const template = parsePrintTemplate(url.searchParams.get("template"));
    const theme = parsePrintTheme(url.searchParams.get("theme"));
    const html = await tableQr.printHtml(ctx, outletId, { areaId, tableId, template, theme });
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus, headers: NO_STORE });
    }
    console.error("[qr print]", error);
    return NextResponse.json({ error: "Beklenmeyen bir hata oluştu" }, { status: 500, headers: NO_STORE });
  }
}
