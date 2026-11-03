import type { AppProps } from "@/shell/registry";
import { registerCatalogApp } from "@/shell/registry";

/**
 * Registers room service apps (ROOM_SERVICE category).
 * Called from registerOrderApps() in src/modules/order/apps.ts.
 */
export function registerRoomServiceApps(): void {
  // 1. Oda Servisi Menü Yönetimi
  registerCatalogApp({
    id: "rs.menu",
    title: "Oda Servisi Menü Yönetimi",
    launchLabel: "Oda Servisi Menü Yönetimi",
    icon: "menu",
    moduleKey: "ROOM_SERVICE",
    screenCode: "RO-TAL",
    category: "ROOM_SERVICE",
    needsHotel: true,
    window: { w: 1040, h: 700, minW: 800 },
    kind: "component",
    component: () =>
      import("@/modules/menu/ui/MenuManager").then((m) => ({
        default: (props: AppProps) => m.MenuManager({ ...props, lockOutletType: "ODA_SERVISI" }),
      })),
    mobile: "none",
  });

  // 2. Oda Servisi Menü Tasarım Stüdyosu
  registerCatalogApp({
    id: "rs.tema",
    title: "Oda Servisi Menü Tasarım Stüdyosu",
    launchLabel: "Oda Servisi Menü Tasarım Stüdyosu",
    icon: "tema",
    moduleKey: "ROOM_SERVICE",
    screenCode: "RO-TAL",
    category: "ROOM_SERVICE",
    needsHotel: false,
    window: { w: 1480, h: 900, minW: 880, minH: 580 },
    kind: "component",
    component: () => import("@/modules/menu/ui/ThemeManager").then((m) => ({ default: m.ThemeManager })),
    mobile: "none",
  });

  // 3. Oda Servisi Kayıtları (Siparişler)
  registerCatalogApp({
    id: "rs.kayitlar",
    title: "Oda Servisi Kayıtları",
    launchLabel: "Oda Servisi Kayıtları",
    icon: "pencere",
    moduleKey: "ROOM_SERVICE",
    screenCode: "RO-TAL",
    category: "ROOM_SERVICE",
    needsHotel: true,
    window: { w: 1100, h: 720, minW: 800, minH: 500 },
    kind: "component",
    component: () =>
      import("./ui/RoomServiceOrdersWindow").then((m) => ({ default: m.RoomServiceOrdersWindow })),
    mobile: "full",
  });

  // 4. Oda Servisi Raporları
  registerCatalogApp({
    id: "rs.rapor",
    title: "Oda Servisi Raporları",
    launchLabel: "Oda Servisi Raporları",
    icon: "denetim",
    moduleKey: "ROOM_SERVICE",
    screenCode: "RO-SLA",
    category: "ROOM_SERVICE",
    needsHotel: true,
    window: { w: 1150, h: 750, minW: 800, minH: 520 },
    kind: "component",
    component: () =>
      import("./ui/RoomServiceReportsWindow").then((m) => ({ default: m.RoomServiceReportsWindow })),
    mobile: "readonly",
  });
}

