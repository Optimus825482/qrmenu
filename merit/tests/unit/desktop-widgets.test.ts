import { beforeEach, describe, expect, it } from "vitest";
import { parseShellPrefs, shellPrefsInputSchema } from "@/shell/prefsSchema";
import { buildPersistSnapshot } from "@/shell/persistSnapshot";
import { registerApp } from "@/shell/registry";
import { DEFAULT_APPEARANCE, NOTE_MAX, type ShellPrefs } from "@/shell/types";
import { defaultWidgets, nextWidgetPosition, WIDGETS } from "@/shell/widgets";
import { createWindowStore, deskHeight, effectiveViewport } from "@/shell/windowStore";

registerApp({
  id: "w.a",
  title: "App",
  icon: "pencere",
  moduleKey: "CORE",
  screenCode: "CR-KOM",
  category: "GENEL",
  needsHotel: false,
  window: { w: 500, h: 400 },
  kind: "component",
  component: async () => ({ default: () => null }),
});

const BASE: ShellPrefs = { ...DEFAULT_APPEARANCE, icons: [{ appId: "w.a", x: 40, y: 40 }], windows: [] };

let store: ReturnType<typeof createWindowStore>;
const s = () => store.getState();
const desk = () => {
  const vp = effectiveViewport(s());
  return { vp, h: deskHeight(vp) };
};

beforeEach(() => {
  store = createWindowStore();
  s().setViewport(1280, 800);
});

describe("masaüstü widget'ları", () => {
  it("hiç seçim yapmamış kullanıcıya sağda saat ve altında yaprak takvim gelir", () => {
    s().restore(BASE);
    const { vp } = desk();
    const [clock, calendar] = s().widgets;
    expect(s().widgets.map((w) => w.id)).toEqual(["clock", "calendar"]);
    expect(clock.x + WIDGETS.clock.w).toBeGreaterThan(vp.w - 40);
    expect(calendar.x + WIDGETS.calendar.w).toBeGreaterThan(vp.w - 40);
    expect(calendar.y).toBeGreaterThanOrEqual(clock.y + WIDGETS.clock.h);
  });

  it("kaydedilmiş liste aynen döner; boş liste 'hepsini kaldırdım' demektir", () => {
    s().restore({ ...BASE, widgets: [] });
    expect(s().widgets).toEqual([]);
    s().restore({ ...BASE, widgets: [{ id: "note", x: 300, y: 200 }, { id: "note", x: 1, y: 1 }] });
    expect(s().widgets).toEqual([{ id: "note", x: 300, y: 200 }]);
  });

  it("ekleme sağ sütunda alt alta dizer, aynı widget ikinci kez eklenmez, kaldırılabilir", () => {
    s().restore(BASE);
    s().addWidget("digital");
    s().addWidget("digital");
    expect(s().widgets.map((w) => w.id)).toEqual(["clock", "calendar", "digital"]);
    const [, calendar, digital] = s().widgets;
    expect(digital.y).toBeGreaterThanOrEqual(calendar.y + WIDGETS.calendar.h);
    s().removeWidget("clock");
    expect(s().widgets.map((w) => w.id)).toEqual(["calendar", "digital"]);
    expect(s().snapshot().widgets).toEqual(s().widgets);
  });

  it("bütün widget'lar eklendiğinde hiçbiri üst üste binmez ve masaüstünde kalır", () => {
    s().restore(BASE);
    for (const id of ["month", "digital", "note", "status"] as const) s().addWidget(id);
    const { vp, h } = desk();
    const rects = s().widgets.map((w) => ({ ...w, w: WIDGETS[w.id].w, h: WIDGETS[w.id].h }));
    expect(rects).toHaveLength(6);
    for (const a of rects) {
      expect(a.x >= 0 && a.y >= 0 && a.x + a.w <= vp.w && a.y + a.h <= h, a.id).toBe(true);
      for (const b of rects) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.id} / ${b.id}`).toBe(false);
      }
    }
  });

  it("sağ sütun dolunca yeni widget soldaki ikinci sütuna geçer ve masaüstünde kalır", () => {
    const vp = { w: 1280, h: 600 };
    const placed = defaultWidgets(vp, 500);
    const next = nextWidgetPosition("month", placed, vp, 500);
    expect(next.x + WIDGETS.month.w).toBeLessThan(placed[0].x);
    expect(next.y + WIDGETS.month.h).toBeLessThanOrEqual(500);
  });

  it("taşıma masaüstü sınırında tutulur", () => {
    s().restore(BASE);
    const { vp, h } = desk();
    s().moveWidget("clock", 99_999, 99_999);
    expect(s().widgets[0]).toEqual({ id: "clock", x: vp.w - WIDGETS.clock.w, y: h - WIDGETS.clock.h });
    s().moveWidget("clock", -50, -50);
    expect(s().widgets[0]).toEqual({ id: "clock", x: 0, y: 0 });
  });

  it("kilitliyken simge de widget da yerinden oynamaz; kilit açılınca taşınır", () => {
    s().restore(BASE);
    const before = { icons: s().icons, widgets: s().widgets };
    s().setDesktopLocked(true);
    s().moveWidget("clock", 10, 10);
    s().moveIcon("w.a", 500, 300);
    s().arrangeIcons();
    expect({ icons: s().icons, widgets: s().widgets }).toEqual(before);
    expect(s().snapshot().desktopLocked).toBe(true);
    // Adding and removing stay possible: the lock is about dragging.
    s().addWidget("note");
    expect(s().widgets.some((w) => w.id === "note")).toBe(true);
    s().setDesktopLocked(false);
    s().moveIcon("w.a", 500, 300);
    expect(s().icons[0]).toMatchObject({ x: 500, y: 300 });
  });

  it("not metni kaydedilir ve sınırı aşamaz", () => {
    s().restore(BASE);
    s().setNote("x".repeat(NOTE_MAX + 50));
    expect(s().note).toHaveLength(NOTE_MAX);
    expect(s().snapshot().note).toHaveLength(NOTE_MAX);
  });
});

describe("kayıt şeması ve telefon kabuğu", () => {
  it("eski kayıtta widget alanı yoktur: tanımsız kalır (varsayılan set); bozuk girdiler ayıklanır", () => {
    expect(parseShellPrefs({ ...BASE })?.widgets).toBeUndefined();
    const parsed = parseShellPrefs({
      ...BASE,
      desktopLocked: "evet",
      note: 12,
      widgets: [{ id: "clock", x: 5, y: 6 }, { id: "yok", x: 1, y: 1 }, { id: "clock", x: 9, y: 9 }, "bozuk"],
    });
    expect(parsed).toMatchObject({ widgets: [{ id: "clock", x: 5, y: 6 }], desktopLocked: false, note: "" });
    expect(shellPrefsInputSchema.safeParse({ ...BASE, widgets: [], desktopLocked: true, note: "selam" }).success).toBe(true);
  });

  it("telefon kabuğundan yapılan kayıt masaüstü widget düzenini değiştirmez", () => {
    const restored = { windows: [], icons: BASE.icons, widgets: undefined };
    const state: ShellPrefs = { ...BASE, widgets: [{ id: "clock", x: 0, y: 0 }] };
    expect(buildPersistSnapshot("mobile", restored, state).widgets).toBeUndefined();
    expect(buildPersistSnapshot("desktop", restored, state).widgets).toEqual(state.widgets);
  });
});
