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
    expect(state).toEqual({ recents: ["raporlar", "izleme"], open: "izleme", overlay: null });
  });

  it("geri: önce üstteki katman, sonra uygulama; ana ekranda hiçbir şey yapmaz", () => {
    const inShade = run([{ type: "launch", app: "ayarlar" }, { type: "shade", open: true }]);
    expect(mobileNavDepth(inShade)).toBe(2);
    const afterOne = mobileNavReducer(inShade, { type: "back" });
    expect(afterOne).toMatchObject({ open: "ayarlar", overlay: null });
    const afterTwo = mobileNavReducer(afterOne, { type: "back" });
    // Geri ile kapatılan uygulama çalışmaya devam eder (son uygulamalarda kalır).
    expect(afterTwo).toEqual({ recents: ["ayarlar"], open: null, overlay: null });
    expect(mobileNavReducer(afterTwo, { type: "back" })).toBe(afterTwo);
    expect(mobileNavDepth(afterTwo)).toBe(0);
  });

  it("ana ekran tuşu uygulamayı ve katmanı birlikte kapatır, son uygulamalar durur", () => {
    const state = run([
      { type: "launch", app: "raporlar" },
      { type: "recents" },
      { type: "home" },
    ]);
    expect(state).toEqual({ recents: ["raporlar"], open: null, overlay: null });
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
    expect(one).toEqual({ recents: ["izleme"], open: null, overlay: "recents" });
    expect(mobileNavReducer(one, { type: "dismiss", app: "izleme" })).toEqual(MOBILE_NAV_INITIAL);
    expect(mobileNavReducer(two, { type: "clear" })).toEqual(MOBILE_NAV_INITIAL);
  });

  it("kaldırılan uygulama (Tanımlar anahtarı) ekrandan ve son uygulamalardan düşer", () => {
    const state = run([{ type: "launch", app: "izleme" }, { type: "launch", app: "tanimlar" }]);
    expect(installedOnly(state, ["izleme", "ayarlar"])).toEqual({ recents: ["izleme"], open: null, overlay: null });
    expect(installedOnly(state, ["izleme", "tanimlar"])).toBe(state);
  });
});
