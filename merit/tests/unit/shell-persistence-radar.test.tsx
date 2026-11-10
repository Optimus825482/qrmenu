// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoreApps } from "@/modules/core/apps";
import { useShellPersistence } from "@/shell/useShellPersistence";
import { DEFAULT_APPEARANCE, type ShellPrefs } from "@/shell/types";
import { windowStore } from "@/shell/windowStore";

const save = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock("@/shell/prefsAction", () => ({ saveShellPrefs: save }));

registerCoreApps();

const APPS = ["core.komuta", "folder.outlet", "folder.sistem", "folder.kullanici", "folder.radar", "core.radar"];
const HOTELS = [{ id: "h1", name: "Merit" }];

const prefs = (icons: string[], shortcutVersion: number): ShellPrefs => ({
  ...DEFAULT_APPEARANCE,
  icons: icons.map((appId, i) => ({ appId, x: 20, y: 20 + i * 90 })),
  windows: [],
  shortcutVersion,
});

function mount(serverPrefs: ShellPrefs | null, appIds: string[] = APPS) {
  return renderHook(() =>
    useShellPersistence({
      userId: "u-radar",
      hotels: HOTELS,
      appIds,
      screensByHotel: {},
      serverPrefs,
      confirmSimpleActions: false,
    }),
  );
}

const iconIds = () => windowStore.getState().icons.map((i) => i.appId);

beforeEach(() => {
  window.localStorage.clear();
  save.mockClear();
  windowStore.setState({ windows: {}, order: [], icons: [], nextZ: 300 });
});
afterEach(() => cleanup());

describe("Operasyon Radarı klasörü kayıtlı masaüstlerine eklenir", () => {
  it("klasörü olmayan kayıtlı masaüstüne sona eklenir, diğer simgelerin sırası değişmez ve kaydedilir", async () => {
    vi.useFakeTimers();
    const before = ["core.komuta", "folder.outlet", "folder.kullanici", "folder.sistem"];
    mount(prefs(before, 5));
    expect(iconIds()).toEqual([...before, "folder.radar"]);
    expect(windowStore.getState().shortcutVersion).toBe(7);
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(save).toHaveBeenCalled();
    const saved = (save.mock.calls.at(-1) as unknown as [ShellPrefs])[0];
    expect(saved.icons.map((i) => i.appId)).toEqual([...before, "folder.radar"]);
    expect(saved.shortcutVersion).toBe(7);
    vi.useRealTimers();
  });

  it("zaten varsa çoğaltmaz", () => {
    mount(prefs(["core.komuta", "folder.radar", "folder.sistem"], 5));
    expect(iconIds().filter((id) => id === "folder.radar")).toHaveLength(1);
    expect(iconIds()).toEqual(["core.komuta", "folder.radar", "folder.sistem"]);
  });

  it("CR-RAD izni yoksa eklenmez", () => {
    mount(prefs(["core.komuta", "folder.sistem"], 5), APPS.filter((id) => !id.includes("radar")));
    expect(iconIds()).toEqual(["core.komuta", "folder.sistem"]);
  });

  it("sürüm işlendikten sonra kullanıcının kaldırdığı klasör geri gelmez", () => {
    mount(prefs(["core.komuta", "folder.sistem"], 6));
    expect(iconIds()).toEqual(["core.komuta", "folder.sistem"]);
  });
});
