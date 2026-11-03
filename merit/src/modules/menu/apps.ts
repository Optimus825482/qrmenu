import { registerCatalogApp } from "@/shell/registry";

/**
 * Registrations of the QR menu module's apps (QR_MENU category). Idempotent: registerCatalogApp overwrites
 * by id. Called next to registerCoreApps() by the shell client.
 */
export function registerMenuApps(): void {
  registerCatalogApp({
    id: "menu.yonetim",
    title: "Menü Yönetimi",
    icon: "menu",
    moduleKey: "QR_MENU",
    screenCode: "QM-MEN",
    category: "OUTLET",
    needsHotel: true,
    window: { w: 1040, h: 700, minW: 800, minH: 520 },
    kind: "component",
    component: () => import("./ui/MenuManager").then((m) => ({ default: m.MenuManager })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "menu.tema",
    title: "Menü Tasarım Stüdyosu",
    icon: "tema",
    moduleKey: "QR_MENU",
    screenCode: "QM-TEM",
    category: "OUTLET",
    needsHotel: false,
    window: { w: 1480, h: 900, minW: 880, minH: 580 },
    kind: "component",
    component: () => import("./ui/ThemeManager").then((m) => ({ default: m.ThemeManager })),
    mobile: "none",
  });
  registerCatalogApp({
    id: "menu.masaqr",
    title: "Masa QR Kodları",
    launchLabel: "Masa QR Kodları",
    icon: "qr",
    moduleKey: "QR_MENU",
    screenCode: "QM-MEN",
    category: "OUTLET",
    needsHotel: true,
    window: { w: 860, h: 600, minW: 640, minH: 420 },
    kind: "component",
    component: () => import("./ui/TableQrWindow").then((m) => ({ default: m.TableQrWindow })),
    mobile: "none",
  });
}
