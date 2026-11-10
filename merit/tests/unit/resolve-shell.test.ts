import { describe, expect, it } from "vitest";
import {
  allowedShells,
  parseShellQuery,
  resolveShell,
  type ShellInput,
  type ShellKind,
} from "@/shell/resolveShell";

const base: ShellInput = {
  screen: { code: "QS-KAS", context: "pos" },
  roleKind: "OUTLET",
  canUsePos: true,
  viewportWidth: 1280,
};
const run = (over: Partial<ShellInput>) => resolveShell({ ...base, ...over });

describe("allowedShells (spec 4.1 tablosu)", () => {
  it.each<[ShellInput["roleKind"], boolean, ShellKind[]]>([
    ["SISTEM", false, ["xp", "personel", "pos"]],
    ["YONETIM", false, ["xp", "personel", "pos"]],
    ["OUTLET", false, ["personel"]],
    ["OUTLET", true, ["personel", "pos"]],
    ["MUTFAK", true, ["pos", "personel"]],
    ["MUTFAK", false, ["pos", "personel"]],
    ["MINIBAR", true, ["personel"]],
  ])("%s canUsePos=%s", (kind, canUsePos, expected) => {
    expect(allowedShells(kind, canUsePos)).toEqual(expected);
  });
});

describe("parseShellQuery", () => {
  it.each<[string, ShellKind | null]>([
    ["mod=xp", "xp"],
    ["mod=personel", "personel"],
    ["mod=pos", "pos"],
    ["kabuk=pos", "pos"],
    ["kabuk=personel", "personel"],
    ["mobil=1", "personel"],
    ["mobil=0", null],
    ["mod=bilinmeyen", null],
    ["", null],
  ])("%s", (qs, expected) => {
    expect(parseShellQuery(new URLSearchParams(qs))).toBe(expected);
  });

  it("mod, kabuk ve mobil sırası: mod önce", () => {
    expect(parseShellQuery(new URLSearchParams("mobil=1&mod=pos"))).toBe("pos");
  });
});

describe("resolveShell karar sırası: query > device > prefs > screen > viewport", () => {
  it("izin verilmeyen sorgu atlanır, cihaz kaydı kazanır (R-GAR, canUsePos=false)", () => {
    const d = run({ query: "pos", canUsePos: false, device: { shell: "personel" }, screen: { code: "QS-KUY", context: "personel" } });
    expect(d.shell).toBe("personel");
    expect(d.source).toBe("device");
  });

  it("R-KAS + ?mod=personel -> personel (query)", () => {
    const d = run({ query: "personel" });
    expect(d).toMatchObject({ shell: "personel", source: "query", layout: "standard" });
  });

  it("R-KDS varsayılan pos (ekran bağlamı)", () => {
    const d = run({ roleKind: "MUTFAK", screen: { code: "QS-KDS", context: "pos" } });
    expect(d).toMatchObject({ shell: "pos", source: "screen" });
  });

  it("R-DEP (MINIBAR) her koşulda personel; xp sorgusu yok sayılır", () => {
    for (const query of [null, "xp", "pos", "personel"] as const) {
      const d = run({ roleKind: "MINIBAR", canUsePos: false, query, screen: { code: "MB-ZIM", context: "personel" }, viewportWidth: 1366 });
      expect(d.shell).toBe("personel");
      expect(d.allowed).toEqual(["personel"]);
    }
  });

  it("R-SYS 1366 -> xp/desktop; 390 -> xp/android; ?mobil=1 1366 -> personel", () => {
    const sys = { roleKind: "SISTEM" as const, screen: { code: "QM-MEN", context: "xp" as const } };
    expect(run({ ...sys, viewportWidth: 1366 })).toMatchObject({ shell: "xp", layout: "desktop" });
    expect(run({ ...sys, viewportWidth: 390 })).toMatchObject({ shell: "xp", layout: "android" });
    expect(run({ ...sys, viewportWidth: 1366, query: "personel" })).toMatchObject({ shell: "personel", source: "query" });
  });

  it("R-KAS device pos 1280 -> pos; 390 -> personel (viewport)", () => {
    const device = { shell: "pos" as const, kiosk: true };
    expect(run({ device, viewportWidth: 1280 })).toMatchObject({ shell: "pos", source: "device" });
    expect(run({ device, viewportWidth: 390 })).toMatchObject({ shell: "personel", source: "viewport" });
  });

  it("pos sınırı: 599 -> personel, 600 -> pos", () => {
    expect(run({ viewportWidth: 599 }).shell).toBe("personel");
    expect(run({ viewportWidth: 600 }).shell).toBe("pos");
  });

  it("xp sınırı: 759 -> android, 760 -> desktop", () => {
    const sys = { roleKind: "YONETIM" as const, screen: { code: "QS-RAP", context: "xp" as const } };
    expect(run({ ...sys, viewportWidth: 759 }).layout).toBe("android");
    expect(run({ ...sys, viewportWidth: 760 }).layout).toBe("desktop");
  });

  it("yatay telefon: geniş ama kısa ekran android kalır (499 -> android, 500 -> desktop)", () => {
    const sys = { roleKind: "SISTEM" as const, screen: { code: "ADMIN", context: "xp" as const } };
    expect(run({ ...sys, viewportWidth: 812, viewportHeight: 375 }).layout).toBe("android");
    expect(run({ ...sys, viewportWidth: 932, viewportHeight: 499 }).layout).toBe("android");
    expect(run({ ...sys, viewportWidth: 932, viewportHeight: 500 }).layout).toBe("desktop");
    // Dizüstü (1366x650) ve yükseklik bilinmediğinde masaüstü değişmez.
    expect(run({ ...sys, viewportWidth: 1366, viewportHeight: 650 }).layout).toBe("desktop");
    expect(run({ ...sys, viewportWidth: 1366, viewportHeight: null }).layout).toBe("desktop");
  });

  it("ekranın doğal bağlamı: QS-KDS pos; MB-DOL/MB-TAN/MB-RAP xp", () => {
    expect(run({ roleKind: "MUTFAK", screen: { code: "QS-KDS", context: "pos" } }).shell).toBe("pos");
    for (const code of ["MB-DOL", "MB-TAN", "MB-RAP"]) {
      expect(run({ roleKind: "YONETIM", screen: { code, context: "xp" }, viewportWidth: 1366 }).shell).toBe("xp");
    }
  });

  it("MINIBAR rolü için xp bağlamı izin dışı -> personel", () => {
    for (const code of ["MB-DOL", "MB-TAN", "MB-RAP"]) {
      const d = run({ roleKind: "MINIBAR", canUsePos: false, screen: { code, context: "xp" }, viewportWidth: 1366 });
      expect(d.shell).toBe("personel");
    }
  });

  it("tercih (prefs) ekran bağlamından önce gelir, izinliyse", () => {
    const d = run({ roleKind: "SISTEM", preferred: "personel", screen: { code: "QM-MEN", context: "xp" }, viewportWidth: 1366 });
    expect(d).toMatchObject({ shell: "personel", source: "prefs" });
  });

  it("izinsiz tercih atlanır (OUTLET canUsePos=false, tercih pos)", () => {
    const d = run({ canUsePos: false, preferred: "pos", screen: { code: "QS-KUY", context: "personel" } });
    expect(d).toMatchObject({ shell: "personel", source: "screen" });
  });

  it("query cihazı ve tercihi yener", () => {
    const d = run({ roleKind: "SISTEM", query: "xp", device: { shell: "pos" }, preferred: "personel", viewportWidth: 1366 });
    expect(d).toMatchObject({ shell: "xp", source: "query" });
  });

  it("cihaz kaydı tercihi yener", () => {
    const d = run({ device: { shell: "pos" }, preferred: "personel" });
    expect(d).toMatchObject({ shell: "pos", source: "device" });
  });

  it("sunucu (viewportWidth null): viewport kuralı atlanır, layout standard", () => {
    expect(run({ viewportWidth: null })).toMatchObject({ shell: "pos", layout: "standard" });
    expect(run({ roleKind: "SISTEM", screen: { code: "QM-MEN", context: "xp" }, viewportWidth: null })).toMatchObject({ shell: "xp", layout: "standard" });
  });

  it("allowed listesi karara eklenir", () => {
    expect(run({ canUsePos: false, screen: { code: "QS-KUY", context: "personel" } }).allowed).toEqual(["personel"]);
  });

  it("hiç aday izinli değilse ilk izinli kabuk", () => {
    const d = run({ roleKind: "MINIBAR", canUsePos: false, screen: { code: "MB-RAP", context: "xp" }, query: "xp", device: { shell: "pos" } });
    expect(d.shell).toBe("personel");
  });

  it("MUTFAK 390 genişlikte pos -> personel", () => {
    const d = run({ roleKind: "MUTFAK", screen: { code: "QS-KDS", context: "pos" }, viewportWidth: 390 });
    expect(d).toMatchObject({ shell: "personel", source: "viewport" });
  });

  it("personel bağlamı genişlikten etkilenmez", () => {
    expect(run({ screen: { code: "QS-KUY", context: "personel" }, viewportWidth: 390 })).toMatchObject({ shell: "personel", layout: "standard" });
  });
});
