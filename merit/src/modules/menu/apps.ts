import { registerApp } from "@/shell/registry";

/**
 * Registrations of the QR menu module's apps (QR_MENU category). Idempotent: registerApp overwrites
 * by id. Called next to registerCoreApps() by the shell client.
 */
export function registerMenuApps(): void {
  registerApp({
    id: "menu.yonetim",
    title: "Menü Yönetimi",
    icon: "menu",
    moduleKey: "QR_MENU",
    screenCode: "QM-MEN",
    category: "QR_MENU",
    needsHotel: true,
    window: { w: 1040, h: 700, minW: 800, minH: 520 },
    kind: "component",
    component: () => import("./ui/MenuManager").then((m) => ({ default: m.MenuManager })),
    mobile: "none",
  });
  registerApp({
    id: "menu.tema",
    title: "Tema Yönetimi",
    icon: "tema",
    moduleKey: "QR_MENU",
    screenCode: "QM-TEM",
    category: "QR_MENU",
    needsHotel: false,
    window: { w: 760, h: 520, minW: 600, minH: 420 },
    kind: "component",
    component: () => import("./ui/ThemeManager").then((m) => ({ default: m.ThemeManager })),
    mobile: "none",
  });
}
