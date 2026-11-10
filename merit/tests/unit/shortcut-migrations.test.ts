import { describe, expect, it, vi } from "vitest";
import { buildShortcutMigrations, runShortcutMigrations } from "@/shell/shortcutMigrations";
import { registerApp } from "@/shell/registry";
import { createWindowStore } from "@/shell/windowStore";

describe("runShortcutMigrations", () => {
  it("sürümden büyükleri artan sırada çalıştırır ve son sürümü döndürür", () => {
    const order: number[] = [];
    const mk = (version: number) => ({ version, run: () => void order.push(version) });
    expect(runShortcutMigrations(1, [mk(6), mk(2), mk(5), mk(1)])).toBe(6);
    expect(order).toEqual([2, 5, 6]);
  });
  it("güncel kayıtta hiçbir şey çalışmaz", () => {
    const run = vi.fn();
    expect(runShortcutMigrations(6, [{ version: 6, run }])).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

describe("kısayol göçleri (gerçek store)", () => {
  const apps = ["core.komuta", "folder.outlet", "folder.radar", "core.kullanici", "menu.tema"];
  for (const id of apps) {
    registerApp({
      id,
      title: id,
      icon: "pencere",
      moduleKey: "CORE",
      screenCode: "CR-KOM",
      category: "GENEL",
      needsHotel: false,
      window: { w: 500, h: 400 },
      kind: "component",
      component: async () => ({ default: () => null }),
    });
  }
  const setup = (icons: string[]) => {
    const store = createWindowStore();
    const s = () => store.getState();
    s().configure({ hotels: [], appIds: apps, screensByHotel: {} });
    s().setViewport(1280, 800);
    s().setIcons(icons.map((appId, i) => ({ appId, x: 8 + i * 84, y: 8 })));
    const migrations = buildShortcutMigrations({ state: s, visible: apps, primaryDesktopApps: ["core.komuta", "folder.outlet", "folder.radar"] });
    return { s, migrations };
  };

  it("sürüm 0 kayıt: sade masaüstüne çevrilir, sürüm tek kez 7 yazılır", () => {
    const { s, migrations } = setup(["eski.uygulama"]);
    const v = runShortcutMigrations(0, migrations);
    expect(v).toBe(7);
    expect(s().icons.map((i) => i.appId)).toEqual(["core.komuta", "folder.outlet", "folder.radar"]);
  });
  it("sürüm 5 kayıt: yalnız Radar eklenir, kullanıcı sırası bozulmaz", () => {
    const { s, migrations } = setup(["folder.outlet", "core.komuta"]);
    expect(runShortcutMigrations(5, migrations)).toBe(7);
    expect(s().icons.map((i) => i.appId)).toEqual(["folder.outlet", "core.komuta", "folder.radar"]);
  });
  it("Radar zaten varsa yinelenmez", () => {
    const { s, migrations } = setup(["folder.radar"]);
    runShortcutMigrations(5, migrations);
    expect(s().icons).toHaveLength(1);
  });
});
