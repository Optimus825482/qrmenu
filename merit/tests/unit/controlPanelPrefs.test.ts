import { describe, expect, it } from "vitest";
import { safeAction } from "@/lib/result";
import { buildPersistSnapshot } from "@/shell/persistSnapshot";
import { parseShellPrefs, shellPrefsSchema } from "@/shell/prefsSchema";
import { DEFAULT_APPEARANCE, type ShellPrefs } from "@/shell/types";
import { createWindowStore } from "@/shell/windowStore";

/** A record saved before Task 15: no fontScale / fontFamily / theme. */
const legacy = { wallpaper: "royal-gold", icons: [], windows: [] };

describe("ShellPrefs görünüm alanları", () => {
  it("eski kayıt (alanlar yok) → varsayılanlar M / tahoma / luna", () => {
    const prefs = parseShellPrefs(legacy);
    expect(prefs).not.toBeNull();
    expect(prefs).toMatchObject({
      wallpaper: "royal-gold",
      fontScale: "M",
      fontFamily: "tahoma",
      theme: "luna",
    });
    expect(DEFAULT_APPEARANCE).toEqual({
      wallpaper: "bliss",
      wallpaperColor: "#3a6ea5",
      fontScale: "M",
      fontFamily: "tahoma",
      theme: "luna",
      footerBand: true,
      brandWatermark: true,
    });
  });

  it("geçerli değerler korunur", () => {
    const prefs = parseShellPrefs({ ...legacy, fontScale: "XL", fontFamily: "verdana", theme: "royal" });
    expect(prefs).toMatchObject({ fontScale: "XL", fontFamily: "verdana", theme: "royal" });
  });

  it("geçersiz theme → parse null; sunucu eylemi VALIDATION", async () => {
    expect(parseShellPrefs({ ...legacy, theme: "neon" })).toBeNull();
    expect(parseShellPrefs({ ...legacy, fontScale: "XXXXL" })).toBeNull();
    expect(parseShellPrefs({ ...legacy, fontFamily: "comic" })).toBeNull();
    const save = safeAction(shellPrefsSchema, async () => null);
    const result = await save({ ...legacy, theme: "neon" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });
});

describe("windowStore görünüm eylemleri", () => {
  it("setFontScale('XL') snapshot'a yansır; setFontFamily / setTheme da", () => {
    const store = createWindowStore();
    store.getState().setFontScale("XL");
    store.getState().setFontFamily("segoe");
    store.getState().setTheme("zeytin");
    expect(store.getState().snapshot()).toMatchObject({
      fontScale: "XL",
      fontFamily: "segoe",
      theme: "zeytin",
    });
  });

  it("geçersiz değerler yok sayılır", () => {
    const store = createWindowStore();
    store.getState().setFontScale("XXXXL" as never);
    store.getState().setFontFamily("comic" as never);
    store.getState().setTheme("neon" as never);
    expect(store.getState().snapshot()).toMatchObject({
      fontScale: "M",
      fontFamily: "tahoma",
      theme: "luna",
    });
  });

  it("restore değerleri alır, bozuk değer varsayılana düşer; resetAppearance varsayılanlara döner", () => {
    const store = createWindowStore();
    const saved = parseShellPrefs({ ...legacy, fontScale: "L", fontFamily: "arial", theme: "gumus" })!;
    store.getState().restore(saved);
    expect(store.getState()).toMatchObject({ fontScale: "L", fontFamily: "arial", theme: "gumus" });

    store.getState().restore({ ...saved, theme: "neon" } as unknown as ShellPrefs);
    expect(store.getState().theme).toBe("luna");

    store.getState().resetAppearance();
    expect(store.getState().snapshot()).toMatchObject(DEFAULT_APPEARANCE);
  });

  it("mobil kayıt görünüm alanlarını güncel durumdan alır, düzeni restore edilenden", () => {
    const store = createWindowStore();
    store.getState().setFontScale("S");
    store.getState().setTheme("royal");
    const restored = { windows: [], icons: [{ appId: "core.komuta", x: 900, y: 300 }] };
    const snap = buildPersistSnapshot("mobile", restored, store.getState().snapshot());
    expect(snap.icons).toBe(restored.icons);
    expect(snap).toMatchObject({ fontScale: "S", theme: "royal", fontFamily: "tahoma" });
  });
});
