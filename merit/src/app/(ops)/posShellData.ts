import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import type { PosRailItem } from "@/components/pos/PosRail";
import { printerStateFromPing } from "@/components/pos/printerState";
import type { PrinterState } from "@/components/pos/usePrinterStatus";

export type PosShellData = {
  kasa: { rail: PosRailItem[]; printer: { initial: PrinterState; href: string } | null } | null;
  kds: { rail: PosRailItem[] } | null;
};

/**
 * POS kabuğunun sunucu verisi: yetkisiz ray öğeleri burada süzülür (istemciye hiç gitmez),
 * yazıcının ilk durumu sayfa yüklenirken hesaplanır (90 sn sessiz = hata).
 */
export async function loadPosShellData(
  ctx: Ctx,
  outlet: { id: string; hotelId: string; printerId: string | null; hasMenu: boolean },
): Promise<PosShellData> {
  const hotelId = outlet.hotelId;
  const [kas, kds, fis, ipt] = await Promise.all([
    can(ctx, "QS-KAS", "V", hotelId),
    can(ctx, "QS-KDS", "V", hotelId),
    can(ctx, "QS-FIS", "V", hotelId),
    can(ctx, "QS-IPT", "V", hotelId),
  ]);
  let kasa: PosShellData["kasa"] = null;
  if (kas) {
    const rail: PosRailItem[] = [
      { id: "tables", label: "Masalar", icon: "table", href: "/kasa" },
      { id: "queue", label: "Kuyruk", icon: "clipboard", href: "/kasa?sekme=kuyruk" },
      { id: "calls", label: "Çağrılar", icon: "bell", href: "/kasa?sekme=cagrilar" },
      ...(outlet.hasMenu ? [{ id: "menu", label: "Menü", icon: "list", href: "/kasa?sekme=menu" } satisfies PosRailItem] : []),
      ...(fis ? [{ id: "printer", label: "Yazıcı", icon: "printer", href: "/kasa/yazici" } satisfies PosRailItem] : []),
      ...(ipt ? [{ id: "cancel", label: "İptal", icon: "ban", href: "/kasa/iptal" } satisfies PosRailItem] : []),
    ];
    const printer = await prisma.printer.findFirst({
      where: { hotelId, isActive: true, OR: [{ id: outlet.printerId ?? "" }, { outletId: null }] },
      select: { lastSeenAt: true, lastStatus: true },
      orderBy: [{ outletId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    const initial = printerStateFromPing(printer);
    kasa = { rail, printer: fis || kas ? { initial, href: fis ? "/kasa/yazici" : "/kasa" } : null };
  }
  return {
    kasa,
    kds: kds ? { rail: [{ id: "kds", label: "Mutfak", icon: "flame", href: "/kds" }] } : null,
  };
}
