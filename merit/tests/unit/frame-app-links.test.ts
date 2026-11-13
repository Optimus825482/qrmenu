import { beforeEach, describe, expect, it } from "vitest";
import { appForPath, decideFrameLink } from "@/shell/frameAppLinks";
import { openFramePath } from "@/shell/openFramePath";
import { registerApp, type AppDefinition } from "@/shell/registry";
import { createWindowStore, MAX_WINDOWS } from "@/shell/windowStore";

const ORIGIN = "https://merit.test";

const frameApp = (id: string, url: string, extra: Partial<AppDefinition> = {}): AppDefinition => ({
  id,
  title: `App ${id}`,
  icon: "pencere",
  moduleKey: "MINIBAR",
  screenCode: "MB-ZIM",
  category: "MINIBAR",
  needsHotel: false,
  window: { w: 500, h: 400 },
  kind: "iframe",
  url,
  ...extra,
});

const APPS = [
  frameApp("fl.kat", "/kat", { screenCode: "MB-KAT", needsHotel: true }),
  frameApp("fl.stok", "/depo/stok"),
  frameApp("fl.doluluk", "/depo/doluluk-yukle", { screenCode: "MB-DOL", needsHotel: true }),
];
for (const a of APPS) registerApp(a);

const HOTELS = [
  { id: "h1", name: "Merit Royal Diamond" },
  { id: "h2", name: "Merit Royal Premium" },
];

describe("appForPath", () => {
  it("yalnız programın ilk ekranını eşler; alt sayfa program değildir", () => {
    expect(appForPath(APPS, "/depo/stok")?.id).toBe("fl.stok");
    expect(appForPath(APPS, "/depo/stok/")?.id).toBe("fl.stok");
    expect(appForPath(APPS, "/kat")?.id).toBe("fl.kat");
    expect(appForPath(APPS, "/kat/doluluk/abc")).toBeUndefined();
    expect(appForPath(APPS, "/depo")).toBeUndefined();
  });
});

describe("decideFrameLink", () => {
  const base = { origin: ORIGIN, currentPath: "/depo/doluluk-yukle", frameSrcPath: "/depo/doluluk-yukle", currentHotelId: "h1" };

  it("başka ekrana giden link kabuğa sorulur ve penceredeki oteli taşır", () => {
    expect(decideFrameLink({ ...base, target: new URL("/depo/stok", ORIGIN) })).toEqual({
      action: "ask",
      href: "/depo/stok?hotelId=h1",
    });
  });

  it("linkin kendi oteli korunur", () => {
    expect(decideFrameLink({ ...base, target: new URL("/depo/stok?hotelId=h2", ORIGIN) })).toEqual({
      action: "ask",
      href: "/depo/stok?hotelId=h2",
    });
  });

  it("pencerenin kendi ilk ekranına dönen link pencerede kalır", () => {
    const fromSub = { ...base, currentPath: "/depo/talepler" };
    expect(decideFrameLink({ ...fromSub, target: new URL("/depo/doluluk-yukle", ORIGIN) })).toEqual({ action: "follow" });
  });

  it("başka kökene giden link ve aynı sayfa linki pencerede kalır", () => {
    expect(decideFrameLink({ ...base, target: new URL("https://example.com/depo/stok") })).toEqual({ action: "follow" });
    expect(decideFrameLink({ ...base, target: new URL("/depo/doluluk-yukle?x=1", ORIGIN) })).toEqual({ action: "follow" });
  });
});

describe("openFramePath", () => {
  let store: ReturnType<typeof createWindowStore>;
  const s = () => store.getState();

  beforeEach(() => {
    store = createWindowStore();
    s().setViewport(1280, 800);
    s().configure({ hotels: HOTELS });
  });

  it("programın penceresini açar; pencere programın kendi başlığını ve linkteki oteli taşır", () => {
    const out = openFramePath(store, APPS, "/depo/stok?hotelId=h2", ORIGIN);
    expect(out.result).toBe("opened");
    const win = Object.values(s().windows)[0];
    expect(win.appId).toBe("fl.stok");
    expect(win.hotelId).toBe("h2");
  });

  it("aynı otel için açık pencere varsa yenisini açmaz, onu öne getirir", () => {
    const first = openFramePath(store, APPS, "/depo/stok?hotelId=h1", ORIGIN);
    s().open("fl.kat", { hotelId: "h1" });
    const again = openFramePath(store, APPS, "/depo/stok?hotelId=h1", ORIGIN);
    expect(again).toEqual(first);
    expect(s().order).toHaveLength(2);
  });

  it("program olmayan sayfa sayfaya bırakılır", () => {
    expect(openFramePath(store, APPS, "/kat/doluluk/abc?hotelId=h1", ORIGIN)).toEqual({ result: "unknown" });
    expect(s().order).toHaveLength(0);
  });

  it("kullanıcının program listesinde olmayan ekran açılmaz", () => {
    s().configure({ appIds: ["fl.kat"] });
    expect(openFramePath(store, APPS, "/depo/stok?hotelId=h1", ORIGIN)).toMatchObject({ result: "denied", reason: "permission" });
    expect(s().order).toHaveLength(0);
  });

  it("otelde yetkisi olmayan ekran açılmaz", () => {
    s().configure({ screensByHotel: { h1: ["MB-DOL"], h2: ["MB-ZIM"] } });
    expect(openFramePath(store, APPS, "/depo/stok?hotelId=h1", ORIGIN)).toMatchObject({ result: "denied", reason: "permission" });
    expect(openFramePath(store, APPS, "/depo/stok?hotelId=h2", ORIGIN).result).toBe("opened");
  });

  it("pencere sınırı dolunca açmaz ve nedenini bildirir", () => {
    for (let i = 0; i < MAX_WINDOWS; i++) s().open("fl.kat", { hotelId: "h1" });
    expect(openFramePath(store, APPS, "/depo/stok?hotelId=h1", ORIGIN)).toMatchObject({ result: "denied", reason: "limit" });
  });
});
