import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processOccupancyExcel } from "@/modules/minibar/server/occupancyUploadService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let userId: string | null = null;
    let hotelId: string | null = null;

    const ALLOWED_ROLES = ["R-SYS", "R-DEP", "R-FBM", "R-OTM"];
    const ALLOWED_NAMES = [
      "Sistem Yöneticisi",
      "Depo Sorumlusu",
      "F&B Müdürü",
      "F&B Yöneticisi",
      "Otel Müdürü",
    ];

    try {
      const ctx = await requireUser();
      const userRole = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { role: { select: { code: true, name: true, kind: true } } },
      });

      const roleCode = userRole?.role.code || "";
      const roleName = userRole?.role.name || "";
      const isAllowed =
        ALLOWED_ROLES.includes(roleCode) ||
        ALLOWED_NAMES.some((n) => roleName.toLowerCase().includes(n.toLowerCase())) ||
        userRole?.role.kind === "SISTEM";

      if (!isAllowed) {
        return NextResponse.json(
          {
            error:
              "Oda doluluk listesi yükleme yetkisi yalnızca Depo Sorumlusu, F&B Yöneticileri ve Sistem Yöneticisine aittir.",
          },
          { status: 403 },
        );
      }

      userId = ctx.user.id;
      hotelId = ctx.session.hotelId || ctx.user.hotelId || null;
    } catch {
      // Fallback: demo veya oturum açılmamış doğrudan istek
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const formHotelId = formData.get("hotelId") as string | null;
    const forceOverride = formData.get("forceOverride") === "true";

    if (formHotelId) {
      hotelId = formHotelId;
    }

    if (!hotelId) {
      const firstHotel = await prisma.hotel.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      hotelId = firstHotel?.id || null;
    }

    if (!hotelId) {
      return NextResponse.json({ error: "Otel seçilmedi veya sistemde aktif otel yok." }, { status: 400 });
    }

    if (!userId) {
      const defaultUser = await prisma.user.findFirst({
        where: { role: { name: { in: ["SYSTEM_ADMIN", "DEPO_SORUMLUSU", "HOTEL_ADMIN", "KAT_SORUMLUSU"] } } },
        select: { id: true },
      });
      userId = defaultUser?.id || "system";
    }

    if (!file) {
      return NextResponse.json({ error: "Lütfen bir Excel dosyası (.xlsx, .xls) seçiniz." }, { status: 400 });
    }

    const fileName = file.name || "occupancy.xlsx";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await processOccupancyExcel({
      buffer,
      fileName,
      hotelId,
      userId,
      forceScheduleOverride: forceOverride,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Excel dosyası işlenirken hata oluştu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
