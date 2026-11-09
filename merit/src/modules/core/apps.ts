import { registerCatalogApp } from "@/shell/registry";

/**
 * Registrations of the core (CORE module) apps — the single source of the shell's built-in apps.
 * Idempotent: registerCatalogApp overwrites by id. Other modules add their own `apps.ts` the same way.
 */
export function registerCoreApps(): void {
  // 5 Ana Masaüstü Operasyon Klasörü (Folder Apps)
  registerCatalogApp({
    id: "folder.outlet",
    title: "Outlet Operasyonları",
    launchLabel: "Outlet Operasyonları",
    icon: "klasor",
    moduleKey: "CORE",
    screenCode: "CR-TAN",
    category: "OUTLET",
    needsHotel: false,
    window: { w: 880, h: 540, minW: 640, minH: 380 },
    kind: "component",
    component: () =>
      import("@/shell/apps/CategoryFolderWindow").then((m) => ({
        default: m.OutletFolderWindow,
      })),
    mobile: "none",
  });

  registerCatalogApp({
    id: "folder.room-service",
    title: "Oda Servisi Operasyonları",
    launchLabel: "Oda Servisi Operasyonları",
    icon: "servis",
    moduleKey: "CORE",
    screenCode: "RO-TAL",
    category: "ROOM_SERVICE",
    needsHotel: false,
    window: { w: 880, h: 540, minW: 640, minH: 380 },
    kind: "component",
    component: () =>
      import("@/shell/apps/CategoryFolderWindow").then((m) => ({
        default: m.RoomServiceFolderWindow,
      })),
    mobile: "none",
  });

  registerCatalogApp({
    id: "folder.minibar",
    title: "Minibar Operasyonları",
    launchLabel: "Minibar Operasyonları",
    icon: "minibar",
    moduleKey: "CORE",
    screenCode: "MB-KAT",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 900, h: 560, minW: 640, minH: 380 },
    kind: "component",
    component: () =>
      import("@/shell/apps/CategoryFolderWindow").then((m) => ({
        default: m.MinibarFolderWindow,
      })),
    mobile: "none",
  });

  registerCatalogApp({
    id: "folder.sistem",
    title: "Sistem Yönetimi",
    launchLabel: "Sistem Yönetimi",
    icon: "ayarlar",
    moduleKey: "CORE",
    screenCode: "CR-SYS",
    category: "SISTEM",
    needsHotel: false,
    window: { w: 880, h: 540, minW: 640, minH: 380 },
    kind: "component",
    component: () =>
      import("@/shell/apps/CategoryFolderWindow").then((m) => ({
        default: m.SistemFolderWindow,
      })),
    mobile: "none",
  });

  registerCatalogApp({
    id: "folder.kullanici",
    title: "Kullanıcı Yönetimi",
    launchLabel: "Kullanıcı Yönetimi",
    icon: "kullanicilar",
    moduleKey: "CORE",
    screenCode: "CR-KUL",
    category: "KULLANICI",
    needsHotel: false,
    window: { w: 880, h: 540, minW: 640, minH: 380 },
    kind: "component",
    component: () =>
      import("@/shell/apps/CategoryFolderWindow").then((m) => ({
        default: m.KullaniciFolderWindow,
      })),
    mobile: "none",
  });

  registerCatalogApp({
    id: "core.komuta",
    title: "Komuta Merkezi",
    icon: "komuta",
    moduleKey: "CORE",
    screenCode: "CR-KOM",
    category: "GENEL",
    needsHotel: false,
    window: { w: 900, h: 600 },
    kind: "component",
    component: () => import("@/shell/apps/CommandCenter").then((m) => ({ default: m.CommandCenter })),
    mobile: "readonly",
  });
  registerCatalogApp({
    id: "folder.radar",
    title: "Operasyon Radarı",
    launchLabel: "Operasyon Radarı",
    icon: "radar",
    moduleKey: "CORE",
    screenCode: "CR-RAD",
    category: "RADAR",
    needsHotel: false,
    window: { w: 880, h: 540, minW: 640, minH: 380 },
    kind: "component",
    component: () =>
      import("@/shell/apps/CategoryFolderWindow").then((m) => ({
        default: m.RadarFolderWindow,
      })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.radar",
    title: "Canlı Radar",
    launchLabel: "Canlı Radar",
    icon: "radar",
    moduleKey: "CORE",
    screenCode: "CR-RAD",
    category: "RADAR",
    needsHotel: false,
    window: { w: 1280, h: 760, minW: 1024, minH: 640 },
    kind: "component",
    component: () => import("@/modules/radar/ui/RadarWindow").then((m) => ({ default: m.RadarWindow })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.radar.duvar",
    title: "Duvar Ekranı",
    launchLabel: "Duvar Ekranı",
    icon: "radar",
    moduleKey: "CORE",
    screenCode: "CR-RAD",
    category: "RADAR",
    needsHotel: false,
    window: { w: 1280, h: 760, minW: 1024, minH: 640 },
    kind: "component",
    external: { href: "/radar" },
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.tanimlar",
    title: "Tanımlamalar",
    icon: "otel",
    moduleKey: "CORE",
    screenCode: "CR-TAN",
    category: "SISTEM",
    needsHotel: true,
    window: { w: 960, h: 640, minW: 640, minH: 420 },
    kind: "component",
    component: () =>
      import("@/shell/apps/definitions/Definitions").then((m) => ({ default: m.Definitions })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.ekipler",
    title: "Ekip Yönetimi",
    launchLabel: "Ekip Yönetimi",
    icon: "ekipler",
    moduleKey: "CORE",
    screenCode: "CR-KUL",
    category: "KULLANICI",
    needsHotel: true,
    window: { w: 900, h: 600, minW: 640, minH: 420 },
    kind: "component",
    component: () => import("@/shell/apps/TeamManagement").then((m) => ({ default: m.TeamManagement })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.kullanici",
    title: "Kullanıcı Yönetimi",
    icon: "kullanicilar",
    moduleKey: "CORE",
    screenCode: "CR-KUL",
    category: "KULLANICI",
    needsHotel: false,
    window: { w: 960, h: 640, minW: 640, minH: 420 },
    kind: "component",
    component: () => import("@/shell/apps/UserManagement").then((m) => ({ default: m.UserManagement })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.rehber",
    title: "Kurulum Rehberi",
    icon: "soru",
    moduleKey: "CORE",
    screenCode: "CR-REH",
    category: "SISTEM",
    needsHotel: true,
    window: { w: 720, h: 520 },
    kind: "component",
    component: () => import("@/shell/apps/SetupGuide").then((m) => ({ default: m.SetupGuide })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.online",
    title: "Online Kullanıcılar",
    icon: "online",
    moduleKey: "CORE",
    screenCode: "CR-ONL",
    category: "SISTEM",
    needsHotel: true,
    window: { w: 960, h: 560, minW: 640, minH: 420 },
    kind: "component",
    component: () => import("@/shell/apps/OnlineUsers").then((m) => ({ default: m.OnlineUsers })),
    mobile: "readonly",
  });
  registerCatalogApp({
    id: "core.denetim",
    title: "Denetim Günlüğü",
    icon: "denetim",
    moduleKey: "CORE",
    screenCode: "CR-DEN",
    category: "SISTEM",
    needsHotel: false,
    window: { w: 900, h: 560, minW: 640, minH: 420 },
    kind: "component",
    component: () => import("@/shell/apps/AuditLog").then((m) => ({ default: m.AuditLog })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.rapor",
    title: "Raporlar",
    launchLabel: "Raporlar",
    icon: "rapor",
    moduleKey: "CORE",
    screenCode: "CR-RAP",
    category: "RAPOR",
    needsHotel: false,
    window: { w: 1140, h: 720, minW: 860, minH: 520 },
    kind: "component",
    component: () =>
      import("@/modules/reporting/ui/ReportCenterWindow").then((m) => ({
        default: m.ReportCenterWindow,
      })),
    mobile: "readonly",
  });
  registerCatalogApp({
    id: "core.outlet-tanim",
    title: "Outlet & Masa Tanımları",
    launchLabel: "Outlet & Masa Tanımları",
    icon: "otel",
    moduleKey: "CORE",
    screenCode: "CR-TAN",
    category: "OUTLET",
    needsHotel: true,
    window: { w: 1060, h: 680, minW: 750, minH: 480 },
    kind: "component",
    component: () =>
      import("@/modules/core/ui/OutletDefinitionsWindow").then((m) => ({
        default: m.OutletDefinitionsWindow,
      })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.ayarlar",
    title: "Denetim Masası",
    launchLabel: "Denetim Masası",
    icon: "ayarlar",
    moduleKey: "CORE",
    screenCode: "CR-SYS",
    category: "SISTEM",
    needsHotel: false,
    window: { w: 640, h: 480 },
    kind: "component",
    component: () => import("@/shell/apps/ControlPanel").then((m) => ({ default: m.ControlPanel })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "core.diagnostik",
    title: "Hata Denetimi & Tanı",
    launchLabel: "Hata Denetimi & Tanı",
    icon: "denetim",
    moduleKey: "CORE",
    screenCode: "CR-SYS",
    category: "SISTEM",
    needsHotel: false,
    window: { w: 1060, h: 680, minW: 800, minH: 500 },
    kind: "component",
    component: () =>
      import("@/shell/apps/DiagnosticWindow").then((m) => ({ default: m.DiagnosticWindow })),
    mobile: "none",
  });
  // "Erişimim": what the signed-in role may do. Bound to CR-KOM (everyone on the desktop has it).
  registerCatalogApp({
    id: "core.erisimim",
    title: "Erişimim",
    launchLabel: "Erişimim",
    icon: "bilgi",
    moduleKey: "CORE",
    screenCode: "CR-KOM",
    category: "GENEL",
    needsHotel: true,
    window: { w: 640, h: 560, minW: 420, minH: 360 },
    kind: "component",
    component: () => import("@/components/guide/AccessWindow"),
    mobile: "none",
  });
  // The iframe app contract: the window hosts a same-origin page (src/app/(admin)/admin/hakkinda).
  registerCatalogApp({
    id: "core.hakkinda",
    title: "Hakkında",
    launchLabel: "Hakkında",
    icon: "bilgi",
    moduleKey: "CORE",
    screenCode: "CR-SYS",
    category: "SISTEM",
    needsHotel: false,
    window: { w: 480, h: 320, resizable: false },
    kind: "iframe",
    url: "/admin/hakkinda",
    mobile: "none",
  });
}
