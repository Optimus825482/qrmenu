import { registerApp } from "@/shell/registry";

/**
 * Registrations of the core (CORE module) apps — the single source of the shell's built-in apps.
 * Idempotent: registerApp overwrites by id. Other modules add their own `apps.ts` the same way.
 */
export function registerCoreApps(): void {
  // 5 Ana Masaüstü Operasyon Klasörü (Folder Apps)
  registerApp({
    id: "folder.outlet",
    title: "Outlet Operasyonları",
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

  registerApp({
    id: "folder.room-service",
    title: "Oda Servisi Operasyonları",
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

  registerApp({
    id: "folder.minibar",
    title: "Minibar Operasyonları",
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

  registerApp({
    id: "folder.sistem",
    title: "Sistem Yönetimi",
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

  registerApp({
    id: "folder.kullanici",
    title: "Kullanıcı Yönetimi",
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

  registerApp({
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
  registerApp({
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
  registerApp({
    id: "core.ekipler",
    title: "Ekip Yönetimi",
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
  registerApp({
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
  registerApp({
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
  registerApp({
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
  registerApp({
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
  registerApp({
    id: "core.rapor",
    title: "Merkezi Raporlama & KPI",
    icon: "rapor",
    moduleKey: "CORE",
    screenCode: "CR-RAP",
    category: "SISTEM",
    needsHotel: false,
    window: { w: 980, h: 620, minW: 720, minH: 450 },
    kind: "component",
    component: () =>
      import("@/shell/apps/CentralReportsWindow").then((m) => ({
        default: m.CentralReportsWindow,
      })),
    mobile: "none",
  });
  registerApp({
    id: "core.outlet-tanim",
    title: "Outlet & Masa Tanımları",
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
  registerApp({
    id: "core.ayarlar",
    title: "Denetim Masası",
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
  // "Erişimim": what the signed-in role may do. Bound to CR-KOM (everyone on the desktop has it).
  registerApp({
    id: "core.erisimim",
    title: "Erişimim",
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
  registerApp({
    id: "core.hakkinda",
    title: "Hakkında",
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
