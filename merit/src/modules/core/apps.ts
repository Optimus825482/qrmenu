import { registerApp } from "@/shell/registry";

/**
 * Registrations of the core (CORE module) apps — the single source of the shell's built-in apps.
 * Idempotent: registerApp overwrites by id. Other modules add their own `apps.ts` the same way.
 */
export function registerCoreApps(): void {
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
    category: "GENEL",
    needsHotel: true,
    window: { w: 960, h: 640, minW: 640, minH: 420 },
    kind: "component",
    component: () =>
      import("@/shell/apps/definitions/Definitions").then((m) => ({ default: m.Definitions })),
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
    window: { w: 640, h: 420 },
    kind: "component",
    component: () => import("@/shell/apps/Placeholders").then((m) => ({ default: m.OnlinePlaceholder })),
    mobile: "readonly",
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
