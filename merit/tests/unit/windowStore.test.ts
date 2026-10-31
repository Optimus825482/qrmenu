import { beforeEach, describe, expect, it } from "vitest";
import { registerApp, type AppDefinition } from "@/shell/registry";
import { createWindowStore, MIN_H, MIN_W, TASKBAR_H, Z_BASE } from "@/shell/windowStore";

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

const TWO_HOTELS = [
  { id: "h1", name: "Merit Royal" },
  { id: "h2", name: "Merit Royal Premium" },
];

let store: ReturnType<typeof createWindowStore>;
const s = () => store.getState();

beforeEach(() => {
  store = createWindowStore();
  s().setViewport(1280, 800);
});

describe("windowStore", () => {
  it("open: iki çağrı farklı id üretir, ikinci pencere +24/+24 kaydırılır", () => {
    const a = s().open("t.a");
    const b = s().open("t.a");
    expect(a).not.toBe(b);
    const wa = s().windows[a];
    const wb = s().windows[b];
    expect(wb.x - wa.x).toBe(24);
    expect(wb.y - wa.y).toBe(24);
    expect(wa).toMatchObject({ appId: "t.a", title: "App t.a", w: 500, h: 400, minimized: false });
    expect(s().order).toEqual([a, b]);
  });

  it("open: z 300'den başlar ve artar; bilinmeyen uygulama açılmaz", () => {
    const a = s().open("t.a");
    const b = s().open("t.b");
    expect(s().windows[a].z).toBe(Z_BASE);
    expect(Z_BASE).toBe(300);
    expect(s().windows[b].z).toBe(Z_BASE + 1);
    expect(s().open("yok")).toBe("");
    expect(Object.keys(s().windows)).toHaveLength(2);
  });

  it("focus: odaklanan pencere en üste çıkar, küçültülmüşse geri gelir", () => {
    const a = s().open("t.a");
    const b = s().open("t.b");
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
    const a = s().open("t.a");
    s().move(a, 100, 80);
    const before = { ...s().windows[a] };
    s().toggleMaximize(a);
    expect(s().windows[a]).toMatchObject({
      maximized: true,
      x: 0,
      y: 0,
      w: 1280,
      h: 800 - TASKBAR_H,
      prev: { x: 100, y: 80, w: before.w, h: before.h },
    });
    s().toggleMaximize(a);
    const after = s().windows[a];
    expect(after).toMatchObject({ maximized: false, x: 100, y: 80, w: before.w, h: before.h });
    expect(after.prev).toBeUndefined();
  });

  it("resize: varsayılan minimum 360×240, uygulamanın minW/minH değeri önceliklidir", () => {
    expect([MIN_W, MIN_H]).toEqual([360, 240]);
    const a = s().open("t.a");
    s().resize(a, 100, 50);
    expect(s().windows[a]).toMatchObject({ w: 360, h: 240 });
    const m = s().open("t.min");
    s().resize(m, 10, 10);
    expect(s().windows[m]).toMatchObject({ w: 420, h: 300 });
    s().resize(m, 700, 520);
    expect(s().windows[m]).toMatchObject({ w: 700, h: 520 });
  });

  it("move: negatif koordinat 0'a, ekran dışı ekran içine kırpılır", () => {
    const a = s().open("t.a");
    s().move(a, -50, -10);
    expect(s().windows[a]).toMatchObject({ x: 0, y: 0 });
    s().move(a, 5000, 5000);
    expect(s().windows[a]).toMatchObject({ x: 1280 - 500, y: 800 - TASKBAR_H - 400 });
  });

  it("close pencereyi ve sırasını siler", () => {
    const a = s().open("t.a");
    const b = s().open("t.b");
    s().close(a);
    expect(s().windows[a]).toBeUndefined();
    expect(s().order).toEqual([b]);
  });

  it("otel bağlamı: çok otelde hotelId boş kalır, setHotel başlığa otel adını ekler; tek otel otomatik", () => {
    s().configure({ hotels: TWO_HOTELS });
    const w = s().open("t.otel");
    expect(s().windows[w].hotelId).toBeUndefined();
    expect(s().windows[w].title).toBe("Otel Uyg");
    s().setHotel(w, "h2");
    expect(s().windows[w]).toMatchObject({ hotelId: "h2", title: "Otel Uyg · Merit Royal Premium" });
    s().setHotel(w, "kapsam-disi");
    expect(s().windows[w].hotelId).toBe("h2");
    const direct = s().open("t.otel", { hotelId: "h1" });
    expect(s().windows[direct].title).toBe("Otel Uyg · Merit Royal");

    s().configure({ hotels: [{ id: "h1", name: "Merit Royal" }] });
    const auto = s().open("t.otel");
    expect(s().windows[auto]).toMatchObject({ hotelId: "h1", title: "Otel Uyg · Merit Royal" });
  });

  it("snapshot/restore gidiş-dönüş eşit; yeni pencere id'si çakışmaz", () => {
    s().configure({ hotels: TWO_HOTELS });
    s().setWallpaper("royal-gold");
    s().addIcon("t.a", 10, 20);
    s().addIcon("t.b", 10, 110);
    const a = s().open("t.a");
    s().open("t.otel", { hotelId: "h2" });
    s().toggleMaximize(a);
    const b = s().open("t.b");
    s().minimize(b);
    const snap = s().snapshot();
    expect(snap.wallpaper).toBe("royal-gold");
    expect(snap.windows).toHaveLength(3);

    const other = createWindowStore();
    other.getState().setViewport(1280, 800);
    other.getState().configure({ hotels: TWO_HOTELS });
    other.getState().restore(snap);
    expect(other.getState().snapshot()).toEqual(snap);
    const fresh = other.getState().open("t.a");
    expect(snap.windows.map((w) => w.id)).not.toContain(fresh);
    expect(other.getState().windows[fresh].z).toBeGreaterThan(
      Math.max(...snap.windows.map((w) => w.z)),
    );
  });

  it("restore: kayıtsız/izinsiz uygulamaların pencere ve simgelerini, kapsam dışı oteli düşürür", () => {
    s().configure({ hotels: TWO_HOTELS, appIds: ["t.a", "t.otel"] });
    const base = { x: 0, y: 0, w: 500, h: 400, minimized: false, maximized: false };
    s().restore({
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
    expect(s().windows.w3).toMatchObject({ hotelId: undefined, title: "Otel Uyg" });
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
});
