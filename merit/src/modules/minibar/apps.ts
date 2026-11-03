import { registerCatalogApp } from "@/shell/registry";

/**
 * Registrations of the Minibar tracking module's apps (MINIBAR category).
 * Makes all Minibar screens accessible directly on the Merit OS System Administrator desktop & Start Menu.
 */
export function registerMinibarApps(): void {
  registerCatalogApp({
    id: "minibar.kat",
    title: "Minibar Operasyon & Kat Planı",
    icon: "minibar",
    moduleKey: "MINIBAR",
    screenCode: "MB-KAT",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1280, h: 800, minW: 800, minH: 550 },
    kind: "component",
    external: { href: "/kat" },
    mobile: "full",
  });

  registerCatalogApp({
    id: "minibar.rota",
    title: "Akıllı Tavsiye İş Planı",
    launchLabel: "Akıllı Tavsiye İş Planı",
    icon: "komuta",
    moduleKey: "MINIBAR",
    screenCode: "MB-KAT",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1100, h: 720, minW: 760, minH: 500 },
    kind: "component",
    external: { href: "/kat/tavsiye-is-plani" },
    mobile: "full",
  });

  registerCatalogApp({
    id: "minibar.doluluk",
    title: "Günlük Doluluk Girişi (Excel)",
    icon: "pencere",
    moduleKey: "MINIBAR",
    screenCode: "MB-DOL",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1100, h: 750, minW: 760, minH: 500 },
    kind: "component",
    external: { href: "/depo/doluluk-yukle" },
    mobile: "readonly",
  });

  registerCatalogApp({
    id: "minibar.stok",
    title: "Konsinye Stok & Zimmet Havuzu",
    icon: "otel",
    moduleKey: "MINIBAR",
    screenCode: "MB-ZIM",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1150, h: 750, minW: 760, minH: 500 },
    kind: "component",
    external: { href: "/depo/stok" },
    mobile: "full",
  });

  registerCatalogApp({
    id: "minibar.rapor",
    title: "Minibar Tüketim & Görev Raporları",
    icon: "denetim",
    moduleKey: "MINIBAR",
    screenCode: "MB-RAP",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1200, h: 800, minW: 800, minH: 520 },
    kind: "component",
    external: { href: "/depo/raporlar" },
    mobile: "readonly",
  });

  registerCatalogApp({
    id: "minibar.tanim",
    title: "Minibar Tanımları & Audit Log",
    icon: "ayarlar",
    moduleKey: "MINIBAR",
    screenCode: "MB-TAN",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1300, h: 850, minW: 850, minH: 550 },
    kind: "component",
    external: { href: "/depo/tanimlar" },
    mobile: "none",
  });

  registerCatalogApp({
    id: "minibar.odaqr",
    title: "Oda QR Kodları & Baskı",
    launchLabel: "Oda QR Kodları & Baskı",
    icon: "qr",
    moduleKey: "MINIBAR",
    screenCode: "MB-TAN",
    category: "MINIBAR",
    needsHotel: true,
    window: { w: 980, h: 620, minW: 720, minH: 450 },
    kind: "component",
    component: () =>
      import("@/modules/minibar/ui/RoomQrWindow").then((m) => ({
        default: m.RoomQrWindow,
      })),
    mobile: "none",
  });
}
