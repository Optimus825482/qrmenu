import { describe, expect, it } from "vitest";
import { buildPersistSnapshot } from "@/shell/persistSnapshot";
import type { ShellPrefs } from "@/shell/types";

const win = (id: string, x: number): ShellPrefs["windows"][number] => ({
  id,
  appId: "core.komuta",
  title: "Komuta Merkezi",
  x,
  y: 40,
  w: 600,
  h: 400,
  minimized: false,
  maximized: false,
  z: 1000,
});

const restored = {
  windows: [win("w1", 900)],
  icons: [{ appId: "core.komuta", x: 1500, y: 300 }],
};

// What a phone-sized clamp would have done to the live store state.
const clamped: ShellPrefs = {
  wallpaper: "royal-gold",
  windows: [win("w1", 10)],
  icons: [{ appId: "core.komuta", x: 300, y: 300 }],
};

describe("buildPersistSnapshot", () => {
  it("mobil: windows/icons restore edilen düzenle birebir aynı, yalnız duvar kağıdı güncel", () => {
    const snap = buildPersistSnapshot("mobile", restored, clamped);
    expect(snap.windows).toBe(restored.windows);
    expect(snap.icons).toBe(restored.icons);
    expect(snap.wallpaper).toBe("royal-gold");
  });

  it("masaüstü: güncel durumun tamamı", () => {
    expect(buildPersistSnapshot("desktop", restored, clamped)).toEqual(clamped);
  });
});
