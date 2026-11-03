import { registerApp } from "@/shell/registry";

/** Registrations of the MyBar module's XP apps. Idempotent: registerApp overwrites by id. */
export function registerMybarApps(): void {
  registerApp({
    id: "minibar.mybar",
    title: "MyBar Talepleri",
    icon: "mybar",
    moduleKey: "MINIBAR",
    screenCode: "MB-PERS",
    category: "MINIBAR",
    needsHotel: true,
    window: { w: 980, h: 600, minW: 720, minH: 420 },
    kind: "component",
    component: () =>
      import("@/shell/apps/MybarRequestsWindow").then((m) => ({ default: m.MybarRequestsWindow })),
    mobile: "readonly",
  });
}
