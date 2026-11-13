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
    component: () =>
      import("@/modules/menu/ui/ThemeManager").then((m) => ({
        default: (props: AppProps) => m.ThemeManager({ ...props, lockOutletType: "ODA_SERVISI" }),
      })),
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

  // 4. Oda Servisi SLA
  registerCatalogApp({
    id: "rs.rapor",
    title: "Oda Servisi SLA",
    launchLabel: "Oda Servisi SLA",
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

  // Oda Servisi Sorumlusu: the two per-room order limits without Denetim Masası (no CR-SYS). The server
  // re-checks the role and the hotel (roomService/limitsAdmin).
  registerCatalogApp({
    id: "rs.sinirlar",
    title: "Oda Servisi Sınırları",
    launchLabel: "Oda Servisi Sınırları",
    icon: "ayarlar",
    moduleKey: "ROOM_SERVICE",
    screenCode: "RO-TAL",
    purpose: "Bir odanın aynı anda kaç açık siparişi olabileceğini ve iki sipariş arasındaki bekleme süresini belirlersin.",
    roleCodes: ["R-OSS", "R-SYS"],
    category: "ROOM_SERVICE",
    needsHotel: false,
    window: { w: 640, h: 560, minW: 420, minH: 380 },
    kind: "component",
    component: () =>
      import("./ui/RoomServiceLimitsWindow").then((m) => ({ default: m.RoomServiceLimitsWindow })),
    mobile: "full",
  });

  // Cross-hotel coverage: who may watch or process the room-service requests of another hotel, and until when.
  // The server re-checks the role, the hotel and the grantee's rank (roomService/coverage).
  registerCatalogApp({
    id: "rs.oteller-arasi",
    title: "Oteller Arası Oda Servisi",
    launchLabel: "Oteller Arası Oda Servisi",
    icon: "otel",
    moduleKey: "ROOM_SERVICE",
    screenCode: "RO-TAL",
    purpose: "Bir kullanıcıya başka bir otelin oda servisi taleplerini süreli olarak izleme ya da işleme izni verirsin.",
    roleCodes: ["R-OSS", "R-FBY", "R-FBM", "R-SYS"],
    category: "ROOM_SERVICE",
    needsHotel: false,
    window: { w: 980, h: 680, minW: 560, minH: 420 },
    kind: "component",
    component: () =>
      import("./ui/RoomServiceCoverageWindow").then((m) => ({ default: m.RoomServiceCoverageWindow })),
    mobile: "full",
  });
}

