import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { exportExcel } from "@/modules/core/server/admin/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/admin/rooms/export?hotelId=… — the hotel's rooms as an Excel file. Same rights as
 * viewing the room list (CR-TAN view for that hotel); a failure answers `{ error }` with the
 * DomainError's HTTP status.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const hotelId = new URL(request.url).searchParams.get("hotelId");
    if (!hotelId) throw new DomainError("VALIDATION", "Otel belirtilmedi");
    const ctx = await requireUser();
    const buffer = await exportExcel(ctx, hotelId);
    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { code: true } });
    const code = (hotel?.code ?? "otel").replace(/[^A-Za-z0-9_-]/g, "");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="odalar-${code}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.httpStatus, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("[rooms export]", error);
    return NextResponse.json(
      { error: "Beklenmeyen bir hata oluştu" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
