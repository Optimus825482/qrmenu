import { registerCatalogApp } from "@/shell/registry";
import { registerRoomServiceApps } from "./roomServiceApps";

/**
 * Registrations of the QR order module's apps (QR_ORDER category). Idempotent: registerCatalogApp
 * overwrites by id. Called next to registerCoreApps()/registerMenuApps() by the shell client.
 */
export function registerOrderApps(): void {
  registerCatalogApp({
    id: "order.yazicilar",
    title: "Yazıcılar",
    launchLabel: "Yazıcılar",
    icon: "yazici",
    moduleKey: "QR_ORDER",
    screenCode: "QS-FIS",
    category: "QR_ORDER",
    needsHotel: true,
    window: { w: 860, h: 560, minW: 700, minH: 420 },
    kind: "component",
    component: () => import("./ui/PrintersWindow").then((m) => ({ default: m.PrintersWindow })),
    mobile: "none",
  });

  // Sipariş ve Çağrı Yönetimi: table orders and guest calls of every outlet of the selected hotel, corrected and
  // cancelled by the system administrator (QS-YON; the server re-checks every action).
  registerCatalogApp({
    id: "order.yonetim",
    title: "Sipariş ve Çağrı Yönetimi",
    launchLabel: "Sipariş ve Çağrı Yönetimi",
    icon: "liste",
    moduleKey: "QR_ORDER",
    screenCode: "QS-YON",
    purpose: "Bütün outletlerin masa siparişlerini ve misafir çağrılarını tek listede görür, durumunu düzeltir ya da iptal edersin.",
    category: "QR_ORDER",
    needsHotel: true,
    window: { w: 1080, h: 680, minW: 640, minH: 420 },
    kind: "component",
    component: () => import("./ui/OutletAdminWindow").then((m) => ({ default: m.OutletAdminWindow })),
    mobile: "full",
  });

  registerRoomServiceApps();
}
