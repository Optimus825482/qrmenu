import { beforeEach, describe, expect, it } from "vitest";
import { registerApp, type AppDefinition } from "@/shell/registry";
import { DEFAULT_APPEARANCE } from "@/shell/types";
import {
  createWindowStore,
  FOOTER_HEIGHT,
  hotelsForApp,
  MAX_WINDOWS,
  MIN_H,
  MIN_W,
  TASKBAR_H,
  Z_BASE,
  Z_SPAN,
} from "@/shell/windowStore";

const placeholder = async () => ({ default: () => null });

const app = (id: string, extra: Partial<AppDefinition> = {}): AppDefinition => ({
  id,
  title: `App ${id}`,
  icon: "pencere",
  moduleKey: "CORE",
  screenCode: "CR-KOM",
  category: "GENEL",
  needsHotel: false,
  window: { w: 500, h: 400 },
  kind: "component",
  component: placeholder,
  ...extra,
});

registerApp(app("t.a"));
registerApp(app("t.b"));
registerApp(app("t.min", { window: { w: 600, h: 500, minW: 420, minH: 300 } }));
registerApp(app("t.otel", { title: "Otel Uyg", needsHotel: true }));
registerApp(app("t.minibar", { title: "Minibar", needsHotel: true, screenCode: "MB-KAT" }));

const TWO_HOTELS = [
  { id: "h1", name: "Merit Royal" },
  { id: "h2", name: "Merit Royal Premium" },
];

let store: ReturnType<typeof createWindowStore>;
const s = () => store.getState();
/** open() that must succeed (returns the new id). */
const open = (appId: string, opts?: { hotelId?: string }) => {
  const id = s().open(appId, opts);
  expect(id).not.toBeNull();
  return id as string;
};

beforeEach(() => {
  store = createWindowStore();
  s().setViewport(1280, 800);
});

describe("windowStore", () => {
  it("open: iki çağrı farklı id üretir, ikinci pencere +24/+24 kaydırılır", () => {
    const a = open("t.a");
    const b = open("t.a");
    expect(a).not.toBe(b);
    const wa = s().windows[a];
    const wb = s().windows[b];
    expect(wb.x - wa.x).toBe(24);
    expect(wb.y - wa.y).toBe(24);
    expect(wa).toMatchObject({ appId: "t.a", title: "App t.a", w: 500, h: 400, minimized: false });
    expect(s().order).toEqual([a, b]);
  });

  it("open: z 300'den başlar ve artar; bilinmeyen uygulama açılmaz", () => {
    const a = open("t.a");
    const b = open("t.b");
    expect(s().windows[a].z).toBe(Z_BASE);
    expect(Z_BASE).toBe(300);
    expect(s().windows[b].z).toBe(Z_BASE + 1);
    expect(s().open("yok")).toBeNull();
    expect(Object.keys(s().windows)).toHaveLength(2);
  });

  it("focus: odaklanan pencere en üste çıkar, küçültülmüşse geri gelir", () => {
    const a = open("t.a");
    const b = open("t.b");
    expect(s().windows[b].z).toBeGreaterThan(s().windows[a].z);
    s().focus(a);
    expect(s().windows[a].z).toBeGreaterThan(s().windows[b].z);
    expect(s().nextZ).toBe(s().windows[a].z + 1);
    s().minimize(a);
    expect(s().windows[a].minimized).toBe(true);
    s().focus(a);
    expect(s().windows[a].minimized).toBe(false);
  });

  it("toggleMaximize: prev saklanır, masaüstünü (görev çubuğu hariç) kaplar; tekrar → geri", () => {
    const a = open("t.a");
    s().move(a, 100, 80);
    const before = { ...s().windows[a] };
    s().toggleMaximize(a);
    expect(s().windows[a]).toMatchObject({
      maximized: true,
      x: 0,
      y: 0,
      w: 1280,
      h: 800 - TASKBAR_H - FOOTER_HEIGHT, // footer band is on by default
      prev: { x: 100, y: 80, w: before.w, h: before.h },
    });
    s().toggleMaximize(a);
    const after = s().windows[a];
    expect(after).toMatchObject({ maximized: false, x: 100, y: 80, w: before.w, h: before.h });
    expect(after.prev).toBeUndefined();
  });

  it("resize: varsayılan minimum 360×240, uygulamanın minW/minH değeri önceliklidir", () => {
    expect([MIN_W, MIN_H]).toEqual([360, 240]);
    const a = open("t.a");
    s().resize(a, 100, 50);
    expect(s().windows[a]).toMatchObject({ w: 360, h: 240 });
    const m = open("t.min");
    s().resize(m, 10, 10);
    expect(s().windows[m]).toMatchObject({ w: 420, h: 300 });
    s().resize(m, 700, 520);
    expect(s().windows[m]).toMatchObject({ w: 700, h: 520 });
  });

  it("move: negatif koordinat 0'a, ekran dışı ekran içine kırpılır", () => {
    const a = open("t.a");
    s().move(a, -50, -10);
    expect(s().windows[a]).toMatchObject({ x: 0, y: 0 });
    s().move(a, 5000, 5000);
    expect(s().windows[a]).toMatchObject({ x: 1280 - 500, y: 800 - TASKBAR_H - FOOTER_HEIGHT - 400 });
  });

  it("close pencereyi ve sırasını siler", () => {
    const a = open("t.a");
    const b = open("t.b");
    s().close(a);
    expect(s().windows[a]).toBeUndefined();
    expect(s().order).toEqual([b]);
  });

  it("otel bağlamı: çok otelde ilk otelle açılır, setHotel başlığa otel adını ekler; tek otel otomatik", () => {
    s().configure({ hotels: TWO_HOTELS });
    const w = open("t.otel");
    expect(s().windows[w].hotelId).toBe("h1");
    expect(s().windows[w].title).toBe("Otel Uyg · Merit Royal");
    s().setHotel(w, "h2");
    expect(s().windows[w]).toMatchObject({ hotelId: "h2", title: "Otel Uyg · Merit Royal Premium" });
    s().setHotel(w, "kapsam-disi");
    expect(s().windows[w].hotelId).toBe("h2");
    const direct = open("t.otel", { hotelId: "h1" });
    expect(s().windows[direct].title).toBe("Otel Uyg · Merit Royal");

    s().configure({ hotels: [{ id: "h1", name: "Merit Royal" }] });
    const auto = open("t.otel");
    expect(s().windows[auto]).toMatchObject({ hotelId: "h1", title: "Otel Uyg · Merit Royal" });
  });

  it("open: initialPanel pencerede durur ama snapshot'a girmez (geçici)", () => {
    const id = open("t.a");
    expect(s().windows[id].initialPanel).toBeUndefined();
    const withPanel = s().open("t.a", { initialPanel: "katlar" }) as string;
    expect(s().windows[withPanel].initialPanel).toBe("katlar");
    expect(s().snapshot().windows.every((w) => !("initialPanel" in w))).toBe(true);
  });

  it("snapshot/restore gidiş-dönüş eşit; yeni pencere id'si çakışmaz", () => {
    s().configure({ hotels: TWO_HOTELS });
    s().setWallpaper("royal-gold");
    s().addIcon("t.a", 10, 20);
    s().addIcon("t.b", 10, 110);
    const a = open("t.a");
    open("t.otel", { hotelId: "h2" });
    s().toggleMaximize(a);
    const b = open("t.b");
    s().minimize(b);
    const snap = s().snapshot();
    expect(snap.wallpaper).toBe("royal-gold");
    expect(snap.windows).toHaveLength(3);

    const other = createWindowStore();
    other.getState().setViewport(1280, 800);
    other.getState().configure({ hotels: TWO_HOTELS });
    other.getState().restore(snap);
    // Equal except z, which restore renumbers from Z_BASE by rank (stacking order kept).
    const rank = [...snap.windows].sort((x, y) => x.z - y.z).map((w) => w.id);
    expect(other.getState().snapshot()).toEqual({
      ...snap,
      windows: snap.windows.map((w) => ({ ...w, z: Z_BASE + rank.indexOf(w.id) })),
    });
    // ...and a second round trip is exact.
    const again = other.getState().snapshot();
    other.getState().restore(again);
    expect(other.getState().snapshot()).toEqual(again);
    const restoredTop = Math.max(...again.windows.map((w) => w.z));
    const fresh = other.getState().open("t.a") as string;
    expect(snap.windows.map((w) => w.id)).not.toContain(fresh);
    expect(other.getState().windows[fresh].z).toBe(restoredTop + 1);
  });

  it("restore: kayıtsız/izinsiz uygulamaların pencere ve simgelerini, kapsam dışı oteli düşürür", () => {
    s().configure({ hotels: TWO_HOTELS, appIds: ["t.a", "t.otel"] });
    const base = { x: 0, y: 0, w: 500, h: 400, minimized: false, maximized: false };
    s().restore({
      ...DEFAULT_APPEARANCE,
      wallpaper: "gumus",
      icons: [
        { appId: "t.a", x: 1, y: 2 },
        { appId: "t.b", x: 1, y: 90 },
        { appId: "silinmis", x: 1, y: 180 },
      ],
      windows: [
        { ...base, id: "w1", appId: "t.a", title: "App t.a", z: 300 },
        { ...base, id: "w2", appId: "t.b", title: "App t.b", z: 301 },
        { ...base, id: "w3", appId: "t.otel", hotelId: "h9", title: "Otel Uyg · X", z: 302 },
      ],
    });
    expect(s().wallpaper).toBe("gumus");
    expect(s().icons.map((i) => i.appId)).toEqual(["t.a"]);
    expect(s().order).toEqual(["w1", "w3"]);
    // The out-of-scope hotel is dropped; a hotel-bound app falls back to the first hotel in scope.
    expect(s().windows.w3).toMatchObject({ hotelId: "h1", title: "Otel Uyg · Merit Royal" });
  });

  describe("otel bazlı görünürlük (screensByHotel)", () => {
    const THREE_HOTELS = [...TWO_HOTELS, { id: "h3", name: "Merit Royal Diamond" }];
    // MB-KAT only in h2; CR-KOM everywhere.
    const byHotel = { h1: ["CR-KOM"], h2: ["CR-KOM", "MB-KAT"], h3: ["CR-KOM"] };

    beforeEach(() => {
      s().configure({ hotels: THREE_HOTELS, screensByHotel: byHotel });
    });

    it("hotelsForApp yalnız ekranın görünür olduğu otelleri verir", () => {
      expect(hotelsForApp(s(), "t.minibar").map((h) => h.id)).toEqual(["h2"]);
      expect(hotelsForApp(s(), "t.otel").map((h) => h.id)).toEqual(["h1", "h2", "h3"]);
      expect(hotelsForApp(s(), "yok")).toEqual([]);
    });

    it("open: ekranın görünmediği otelle null; tek uygun otel otomatik seçilir", () => {
      expect(s().open("t.minibar", { hotelId: "h1" })).toBeNull();
      const w = open("t.minibar");
      expect(s().windows[w]).toMatchObject({
        hotelId: "h2",
        title: "Minibar · Merit Royal Premium",
      });
      const k = open("t.otel");
      expect(s().windows[k].hotelId).toBe("h1"); // several choices → the first; the banner changes it
    });

    it("setHotel ekranın görünmediği oteli reddeder", () => {
      s().configure({ screensByHotel: { h1: ["CR-KOM"], h2: ["MB-KAT"], h3: ["MB-KAT"] } });
      const w = open("t.minibar");
      expect(s().windows[w].hotelId).toBe("h2");
      s().setHotel(w, "h1");
      expect(s().windows[w].hotelId).toBe("h2");
      s().setHotel(w, "h3");
      expect(s().windows[w].hotelId).toBe("h3");
    });

    it("restore: kayıtlı otelde görünmeyen uygulamanın oteli düşer (tek uygun otele bağlanır)", () => {
      const base = { x: 0, y: 0, w: 500, h: 400, minimized: false, maximized: false, z: 300 };
      s().restore({
        ...DEFAULT_APPEARANCE,
        icons: [],
        windows: [
          { ...base, id: "w1", appId: "t.minibar", hotelId: "h1", title: "Minibar · Merit Royal" },
          { ...base, id: "w2", appId: "t.otel", hotelId: "h3", title: "Otel Uyg · X" },
        ],
      });
      expect(s().windows.w1.hotelId).toBe("h2");
      expect(s().windows.w2).toMatchObject({
        hotelId: "h3",
        title: "Otel Uyg · Merit Royal Diamond",
      });
    });

    it("screensByHotel null iken yalnız otel kapsamı belirleyicidir", () => {
      s().configure({ screensByHotel: null });
      expect(hotelsForApp(s(), "t.minibar")).toHaveLength(3);
      expect(s().open("t.minibar", { hotelId: "h1" })).not.toBeNull();
    });
  });

  it("simgeler: ekle (tekrarsız), taşı (0'a kırp), kaldır, hizala ızgaraya dizer", () => {
    s().addIcon("t.a", 300, 300);
    s().addIcon("t.a", 10, 10);
    expect(s().icons).toEqual([{ appId: "t.a", x: 300, y: 300 }]);
    s().addIcon("t.b", 500, 40);
    s().moveIcon("t.a", -20, -5);
    expect(s().icons[0]).toEqual({ appId: "t.a", x: 0, y: 0 });
    s().arrangeIcons();
    const [first, second] = s().icons;
    expect(first.x).toBe(second.x);
    expect(second.y).toBeGreaterThan(first.y);
    s().removeIcon("t.a");
    expect(s().icons.map((i) => i.appId)).toEqual(["t.b"]);
  });

  it(`en fazla ${MAX_WINDOWS} pencere: ${MAX_WINDOWS + 1}. open null döner, durum değişmez`, () => {
    expect(MAX_WINDOWS).toBe(30);
    for (let i = 0; i < MAX_WINDOWS; i++) expect(s().open("t.a")).not.toBeNull();
    const before = s().snapshot();
    expect(s().open("t.b")).toBeNull();
    expect(s().order).toHaveLength(MAX_WINDOWS);
    expect(s().snapshot()).toEqual(before);
    s().close(s().order[0]);
    expect(s().open("t.b")).not.toBeNull();
  });

  it("restore z değerlerini sırayla 300'den yeniden numaralar; nextZ max+1", () => {
    const base = { x: 0, y: 0, w: 500, h: 400, minimized: false, maximized: false };
    s().restore({
      ...DEFAULT_APPEARANCE,
      icons: [],
      windows: [
        { ...base, id: "w1", appId: "t.a", title: "App t.a", z: 9000 },
        { ...base, id: "w2", appId: "t.b", title: "App t.b", z: 5000 },
      ],
    });
    expect(s().windows.w2.z).toBe(300);
    expect(s().windows.w1.z).toBe(301);
    expect(s().nextZ).toBe(302);
    expect(s().order).toEqual(["w1", "w2"]); // taskbar order is untouched
  });

  it("restore 30'dan fazla pencereyi kırpar", () => {
    const base = { x: 0, y: 0, w: 500, h: 400, minimized: false, maximized: false };
    const windows = Array.from({ length: 35 }, (_, i) => ({
      ...base,
      id: `w${i + 1}`,
      appId: "t.a",
      title: "App t.a",
      z: 300 + i,
    }));
    s().restore({ ...DEFAULT_APPEARANCE, icons: [], windows });
    expect(s().order).toHaveLength(MAX_WINDOWS);
  });

  it("uzun oturumda z bandı aşılmaz: odak sayacı sınıra gelince sıralı yeniden numaralanır", () => {
    const a = open("t.a");
    const b = open("t.b");
    for (let i = 0; i < Z_SPAN + 50; i++) s().focus(i % 2 === 0 ? a : b);
    expect(s().nextZ).toBeLessThan(Z_BASE + Z_SPAN);
    const top = (Z_SPAN + 49) % 2 === 0 ? a : b;
    expect(s().windows[top].z).toBeGreaterThan(s().windows[top === a ? b : a].z);
  });
});
