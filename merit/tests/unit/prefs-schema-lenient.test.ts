import { describe, expect, it } from "vitest";
import { parseShellPrefs } from "@/shell/prefsSchema";
import { DEFAULT_APPEARANCE } from "@/shell/types";

const win = { id: "w1", appId: "a", title: "t", x: 0, y: 0, w: 100, h: 100, minimized: false, maximized: false, z: 1 };
const icon = { appId: "core.kullanici", x: 10, y: 10 };

describe("shell tercihleri alan bazında toleranslı", () => {
  it("tek bozuk görünüm alanı varsayılana düşer, yerleşim korunur", () => {
    const p = parseShellPrefs({
      wallpaper: "yok-boyle-bir-sey",
      theme: 42,
      fontScale: null,
      shortcutVersion: -3,
      icons: [icon],
      windows: [win],
    });
    expect(p).not.toBeNull();
    expect(p).toMatchObject({
      wallpaper: DEFAULT_APPEARANCE.wallpaper,
      theme: DEFAULT_APPEARANCE.theme,
      fontScale: DEFAULT_APPEARANCE.fontScale,
      shortcutVersion: 0,
    });
    expect(p!.icons).toEqual([icon]);
    expect(p!.windows).toHaveLength(1);
  });
  it("bozuk liste girdileri tek tek atılır, geçerliler kalır", () => {
    const p = parseShellPrefs({
      wallpaper: "bliss",
      icons: [icon, { appId: "", x: "a" }, null],
      windows: [win, { ...win, id: "w2", w: "geniş" }],
      recentApps: ["a", 7],
    });
    expect(p!.icons).toEqual([icon]);
    expect(p!.windows.map((w) => w.id)).toEqual(["w1"]);
    expect(p!.recentApps).toEqual(["a"]);
  });
  it("liste olmayan alan boş listeye, nesne olmayan değer null'a döner", () => {
    expect(parseShellPrefs({ wallpaper: "bliss", icons: "x", windows: 3 })).toMatchObject({ icons: [], windows: [] });
    expect(parseShellPrefs("x")).toBeNull();
    expect(parseShellPrefs(null)).toBeNull();
  });
});
