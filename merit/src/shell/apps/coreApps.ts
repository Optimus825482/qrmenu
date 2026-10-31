import { registerApp } from "../registry";

/**
 * P0 core app registrations (placeholders). Task 12 registers the real Komuta Merkezi under the
 * same id (`core.komuta`), which replaces this entry. Idempotent: registerApp overwrites by id.
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
    component: () => import("./Placeholders").then((m) => ({ default: m.KomutaPlaceholder })),
    mobile: "readonly",
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
    component: () => import("./Placeholders").then((m) => ({ default: m.OnlinePlaceholder })),
    mobile: "readonly",
  });
  registerApp({
    id: "core.ayarlar",
    title: "Sistem Ayarları",
    icon: "ayarlar",
    moduleKey: "CORE",
    screenCode: "CR-SYS",
    category: "SISTEM",
    needsHotel: false,
    window: { w: 640, h: 460 },
    kind: "component",
    component: () => import("./Placeholders").then((m) => ({ default: m.AyarlarPlaceholder })),
    mobile: "none",
  });
}
