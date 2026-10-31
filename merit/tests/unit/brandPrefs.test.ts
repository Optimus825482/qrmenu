import { beforeEach, describe, expect, it } from "vitest";
import { safeAction } from "@/lib/result";
import { buildPersistSnapshot } from "@/shell/persistSnapshot";
import { parseShellPrefs, shellPrefsSchema } from "@/shell/prefsSchema";
import { registerApp } from "@/shell/registry";
import { DEFAULT_APPEARANCE, type ShellPrefs } from "@/shell/types";
import { createWindowStore, FOOTER_HEIGHT, TASKBAR_H } from "@/shell/windowStore";

registerApp({
  id: "brand.app",
  title: "Marka testi",
  icon: "pencere",
  moduleKey: "CORE",
  screenCode: "CR-KOM",
  category: "GENEL",
  needsHotel: false,
  window: { w: 500, h: 400 },
  kind: "component",
  component: async () => ({ default: () => null }),
});

const legacy = { wallpaper: "bliss", icons: [], windows: [] };

describe("marka tercihleri (alt telif bandı, filigran)", () => {
  it("varsayılanlar açık; eski kayıt (alanlar yok) açık olarak okunur", () => {
    expect(FOOTER_HEIGHT).toBe(22);
    expect(DEFAULT_APPEARANCE).toMatchObject({ footerBand: true, brandWatermark: true });
    expect(parseShellPrefs(legacy)).toMatchObject({ footerBand: true, brandWatermark: true });
    expect(parseShellPrefs({ ...legacy, footerBand: false, brandWatermark: false })).toMatchObject({
      footerBand: false,
      brandWatermark: false,
    });
    expect(parseShellPrefs({ ...legacy, footerBand: "yes" })).toBeNull();
  });

  describe("store", () => {
    let store: ReturnType<typeof createWindowStore>;
    const s = () => store.getState();

    beforeEach(() => {
      store = createWindowStore();
      s().setViewport(1280, 800);
    });

    it("toggleMaximize: footer açıkken vp.h − 30 − 22, kapalıyken vp.h − 30", () => {
      const a = s().open("brand.app")!;
      s().toggleMaximize(a);
      expect(s().windows[a]).toMatchObject({ maximized: true, h: 800 - TASKBAR_H - 22 });
      s().toggleMaximize(a);

      s().setFooterBand(false);
      s().toggleMaximize(a);
      expect(s().windows[a]).toMatchObject({ maximized: true, h: 800 - TASKBAR_H });
    });

    it("footer açılıp kapanınca büyütülmüş pencere yeniden oturur, serbest pencere içeri kırpılır", () => {
      const a = s().open("brand.app")!;
      s().toggleMaximize(a);
      s().setFooterBand(false);
      expect(s().windows[a].h).toBe(800 - TASKBAR_H);
      s().setFooterBand(true);
      expect(s().windows[a].h).toBe(800 - TASKBAR_H - 22);

      s().toggleMaximize(a); // restore
      s().setFooterBand(false);
      s().move(a, 0, 5000);
      expect(s().windows[a].y).toBe(800 - TASKBAR_H - s().windows[a].h);
      s().setFooterBand(true);
      expect(s().windows[a].y).toBe(800 - TASKBAR_H - 22 - s().windows[a].h);
    });

    it("snapshot / restore taşır; bozuk değer varsayılana düşer; resetAppearance açar", () => {
      s().setFooterBand(false);
      s().setBrandWatermark(false);
      const snap = s().snapshot();
      expect(snap).toMatchObject({ footerBand: false, brandWatermark: false });

      const other = createWindowStore();
      other.getState().restore(snap);
      expect(other.getState()).toMatchObject({ footerBand: false, brandWatermark: false });
      other.getState().restore({ ...snap, footerBand: "x" } as unknown as ShellPrefs);
      expect(other.getState().footerBand).toBe(true);

      s().resetAppearance();
      expect(s()).toMatchObject({ footerBand: true, brandWatermark: true });
    });

    it("mobil kayıt: marka anahtarları görünüm gibi güncel durumdan gelir", () => {
      s().setFooterBand(false);
      s().setBrandWatermark(false);
      const restored = { windows: [], icons: [] };
      const snap = buildPersistSnapshot("mobile", restored, s().snapshot());
      expect(snap).toMatchObject({ footerBand: false, brandWatermark: false });
    });
  });
});

describe("Düz renk duvar kağıdı (ozel + wallpaperColor)", () => {
  const legacy = { wallpaper: "bliss", icons: [], windows: [] };

  it("şema: eksik → #3a6ea5; geçerli hex korunur; geçersiz hex → null / VALIDATION", async () => {
    expect(parseShellPrefs(legacy)).toMatchObject({ wallpaperColor: "#3a6ea5" });
    expect(parseShellPrefs({ ...legacy, wallpaper: "ozel", wallpaperColor: "#112233" })).toMatchObject({
      wallpaper: "ozel",
      wallpaperColor: "#112233",
    });
    for (const bad of ["112233", "#123", "#12345g", "red", "#1122334", ""]) {
      expect(parseShellPrefs({ ...legacy, wallpaperColor: bad })).toBeNull();
    }
    const save = safeAction(shellPrefsSchema, async () => null);
    const result = await save({ ...legacy, wallpaperColor: "#zzzzzz" });
    expect(result.ok).toBe(false);
  });

  it("store: setWallpaperColor geçerli hex'i küçük harfle alır, geçersizi yok sayar; snapshot/restore taşır", () => {
    const store = createWindowStore();
    const s = () => store.getState();
    expect(s().wallpaperColor).toBe("#3a6ea5");
    s().setWallpaperColor("#AABBCC");
    expect(s().wallpaperColor).toBe("#aabbcc");
    s().setWallpaperColor("nope");
    s().setWallpaperColor("#12345");
    expect(s().wallpaperColor).toBe("#aabbcc");
    s().setWallpaper("ozel");
    const snap = s().snapshot();
    expect(snap).toMatchObject({ wallpaper: "ozel", wallpaperColor: "#aabbcc" });

    const other = createWindowStore();
    other.getState().restore(snap);
    expect(other.getState()).toMatchObject({ wallpaper: "ozel", wallpaperColor: "#aabbcc" });
    other.getState().restore({ ...snap, wallpaperColor: "bad" } as unknown as ShellPrefs);
    expect(other.getState().wallpaperColor).toBe("#3a6ea5");

    s().resetAppearance();
    expect(s()).toMatchObject({ wallpaper: "bliss", wallpaperColor: "#3a6ea5" });
  });

  it("mobil kayıt: duvar kağıdı rengi görünüm gibi güncel durumdan gelir", () => {
    const store = createWindowStore();
    store.getState().setWallpaperColor("#010203");
    const snap = buildPersistSnapshot("mobile", { windows: [], icons: [] }, store.getState().snapshot());
    expect(snap.wallpaperColor).toBe("#010203");
  });
});
