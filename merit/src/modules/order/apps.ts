import { registerApp } from "@/shell/registry";
import { registerRoomServiceApps } from "./roomServiceApps";

/**
 * Registrations of the QR order module's apps (QR_ORDER category). Idempotent: registerApp
 * overwrites by id. Called next to registerCoreApps()/registerMenuApps() by the shell client.
 */
export function registerOrderApps(): void {
  registerApp({
    id: "order.yazicilar",
    title: "Yazıcılar",
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

  registerRoomServiceApps();
}
