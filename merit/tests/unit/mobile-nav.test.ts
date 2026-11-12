import { describe, expect, it } from "vitest";
import {
  installedOnly,
  MOBILE_NAV_INITIAL,
  mobileNavDepth,
  mobileNavReducer,
  type MobileNavAction,
  type MobileNavState,
} from "@/shell/components/mobile/mobileNav";

const run = (actions: MobileNavAction[], from: MobileNavState = MOBILE_NAV_INITIAL) =>
  actions.reduce(mobileNavReducer, from);

describe("Android kabuğu gezinmesi (mobileNav)", () => {
  it("uygulama açılır, son uygulamalara en sona eklenir; yeniden açılınca sona taşınır", () => {
    const state = run([
      { type: "launch", app: "izleme" },
      { type: "launch", app: "raporlar" },
      { type: "launch", app: "izleme" },
    ]);
    expect(state).toMatchObject({ recents: ["raporlar", "izleme"], open: "izleme", overlay: null });
  });

  it("geri: önce üstteki katman, sonra uygulama; ana ekranda hiçbir şey yapmaz", () => {
    const inShade = run([{ type: "launch", app: "ayarlar" }, { type: "shade", open: true }]);
    expect(mobileNavDepth(inShade)).toBe(2);
    const afterOne = mobileNavReducer(inShade, { type: "back" });
    expect(afterOne).toMatchObject({ open: "ayarlar", overlay: null });
    const afterTwo = mobileNavReducer(afterOne, { type: "back" });
    // Geri ile kapatılan uygulama çalışmaya devam eder (son uygulamalarda kalır).
    expect(afterTwo).toMatchObject({ recents: ["ayarlar"], open: null, overlay: null });
    expect(mobileNavReducer(afterTwo, { type: "back" })).toBe(afterTwo);
    expect(mobileNavDepth(afterTwo)).toBe(0);
  });

  it("ana ekran tuşu uygulamayı ve katmanı birlikte kapatır, son uygulamalar durur", () => {
    const state = run([
      { type: "launch", app: "raporlar" },
      { type: "recents" },
      { type: "home" },
    ]);
    expect(state).toMatchObject({ recents: ["raporlar"], open: null, overlay: null });
  });

  it("son uygulamalar tuşu aç/kapa çalışır; bildirim paneli onun yerine geçer", () => {
    const overview = run([{ type: "recents" }]);
    expect(overview.overlay).toBe("recents");
    expect(mobileNavReducer(overview, { type: "recents" }).overlay).toBeNull();
    expect(mobileNavReducer(overview, { type: "shade", open: true }).overlay).toBe("shade");
    // Panel kapalıyken "kapat" son uygulamalar ekranına dokunmaz.
    expect(mobileNavReducer(overview, { type: "shade", open: false }).overlay).toBe("recents");
  });

  it("karttan kapatma: açık uygulama da kapanır; son kart gidince ekran kendiliğinden kapanır", () => {
    const two = run([
      { type: "launch", app: "izleme" },
      { type: "launch", app: "raporlar" },
      { type: "recents" },
    ]);
    const one = mobileNavReducer(two, { type: "dismiss", app: "raporlar" });
    expect(one).toMatchObject({ recents: ["izleme"], open: null, overlay: "recents" });
    expect(mobileNavReducer(one, { type: "dismiss", app: "izleme" })).toEqual(MOBILE_NAV_INITIAL);
    expect(mobileNavReducer(two, { type: "clear" })).toEqual(MOBILE_NAV_INITIAL);
  });

  it("uygulama çekmecesi bir katmandır: geri kapatır, uygulama açınca kendiliğinden kapanır", () => {
    const drawer = run([{ type: "drawer" }]);
    expect(drawer.overlay).toBe("drawer");
    expect(mobileNavDepth(drawer)).toBe(1);
    expect(mobileNavReducer(drawer, { type: "back" })).toEqual(MOBILE_NAV_INITIAL);
    expect(mobileNavReducer(drawer, { type: "launch", app: "core.radar" })).toMatchObject({
      recents: ["core.radar"],
      open: "core.radar",
      overlay: null,
    });
  });

  it("kaldırılan uygulama (Tanımlar anahtarı) ekrandan ve son uygulamalardan düşer", () => {
    const state = run([{ type: "launch", app: "izleme" }, { type: "launch", app: "tanimlar" }]);
    expect(installedOnly(state, ["izleme", "ayarlar"])).toMatchObject({ recents: ["izleme"], open: null, overlay: null });
    expect(installedOnly(state, ["izleme", "tanimlar"])).toBe(state);
  });
  it("klasörden açılan ekranda geri klasöre döner, bir daha geri ana ekrana", () => {
    const inScreen = run([
      { type: "launch", app: "folder.minibar" },
      { type: "launch", app: "minibar.depo" },
    ]);
    expect(inScreen).toMatchObject({ open: "minibar.depo", trail: ["folder.minibar"] });
    expect(mobileNavDepth(inScreen)).toBe(2);
    const back = mobileNavReducer(inScreen, { type: "back" });
    expect(back).toMatchObject({ open: "folder.minibar", trail: [] });
    // Klasörden başka bir ekran seçilir: zincir yeniden kurulur, eski ekran araya girmez.
    const second = mobileNavReducer(back, { type: "launch", app: "minibar.rapor" });
    expect(second).toMatchObject({ open: "minibar.rapor", trail: ["folder.minibar"] });
    expect(run([{ type: "back" }, { type: "back" }], second)).toMatchObject({ open: null, trail: [] });
  });

  it("geri zinciri: ana ekran tuşu ve katmandan açma sıfırlar, aynı ekran zincirde iki kez yer almaz", () => {
    const deep = run([
      { type: "launch", app: "folder.minibar" },
      { type: "launch", app: "a" },
      { type: "launch", app: "b" },
      { type: "launch", app: "a" },
    ]);
    expect(deep).toMatchObject({ open: "a", trail: ["folder.minibar", "b"] });
    expect(mobileNavReducer(deep, { type: "home" })).toMatchObject({ open: null, trail: [] });
    // Son uygulamalar / çekmece üzerinden geçiş yeni bir başlangıçtır: geri ana ekrana götürür.
    const viaOverview = run([{ type: "recents" }, { type: "launch", app: "b" }], deep);
    expect(viaOverview).toMatchObject({ open: "b", trail: [] });
    expect(mobileNavReducer(viaOverview, { type: "back" })).toMatchObject({ open: null });
    // Zincirdeki ekran karttan kapatılırsa zincirden de düşer.
    expect(run([{ type: "recents" }, { type: "dismiss", app: "b" }], deep)).toMatchObject({
      open: "a",
      trail: ["folder.minibar"],
    });
    expect(installedOnly(deep, ["a", "b"])).toMatchObject({ open: "a", trail: ["b"] });
  });
});
