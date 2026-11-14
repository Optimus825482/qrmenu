import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasPage } from "../helpers/appRoutes";
import { routeOf, screenForPath } from "@/modules/core/screenPaths";
import { SCREENS } from "@/modules/core/screens";

/** The guest menu route needs a table token (`/q/[token]`), so it has no token-less page by design. */
const TOKEN_ROUTES = new Set(["QM-MIS"]);

describe("ekran kataloğu", () => {
  it("her ekranın yolu src/app altında gerçek bir page.tsx'e çözülür", () => {
    const missing = SCREENS.filter((s) => !TOKEN_ROUTES.has(s.code))
      .filter((s) => !hasPage(routeOf(s)))
      .map((s) => `${s.code} ${s.path}`);
    expect(missing).toEqual([]);
    expect(existsSync(path.resolve(__dirname, "../../src/app/(guest)/q/[token]/page.tsx"))).toBe(true);
  });

  it("38 ekran, sortOrder 1..37, kodlar benzersiz", () => {
    expect(SCREENS).toHaveLength(38);
    expect(SCREENS.map((s) => s.sortOrder)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1));
    expect(new Set(SCREENS.map((s) => s.code)).size).toBe(38);
  });

  it("düzeltilen yollar ve MB-TAL adı", () => {
    const byCode = Object.fromEntries(SCREENS.map((s) => [s.code, s]));
    expect(byCode["MB-TAL"].name).toBe("Düzeltme ve Ek Talepler");
    expect(byCode["MB-TAL"].path).toBe("/kat/duzeltme-onay");
    expect(byCode["MB-ZIM"].path).toBe("/depo/stok");
    expect(byCode["MB-DOL"].path).toBe("/depo/doluluk-yukle");
    expect(byCode["MB-RAP"].path).toBe("/depo/raporlar");
    expect(byCode["MB-TAN"].path).toBe("/depo/tanimlar");
    expect(byCode["MB-TUK"].path).toBe("/kat");
    expect(byCode["MB-PERS"].path).toBe("/kat?filtre=mybar");
    expect(byCode["MB-DND"].path).toBe("/kat?filtre=dnd");
  });

  it("eski, sayfası olmayan yollar katalogda kalmadı", () => {
    const gone = ["/depo/havuz", "/depo/talepler", "/depo/doluluk", "/kat/mybar", "/kat/dnd", "/kat/kontrol"];
    for (const screen of SCREENS) expect(gone).not.toContain(routeOf(screen));
  });
});

describe("screenPaths", () => {
  it("routeOf '#' ve '?' kısmını atar", () => {
    expect(routeOf({ path: "/admin#core.rapor" })).toBe("/admin");
    expect(routeOf({ path: "/kat?filtre=dnd" })).toBe("/kat");
    expect(routeOf({ path: "/depo/stok" })).toBe("/depo/stok");
  });

  it("screenForPath en uzun önek eşleşmesini döndürür", () => {
    expect(screenForPath("/kat/oda-kontrol/abc")?.code).toBe("MB-TUK");
    expect(screenForPath("/kat/islemlerim")?.code).toBe("MB-TUK");
    expect(screenForPath("/kat/qr")?.code).toBe("MB-KF");
    expect(screenForPath("/kat/oda-kontrol-islemleri")?.code).toBe("MB-OKI");
    expect(screenForPath("/kat/oda-kontrol/abc")?.code).toBe("MB-TUK");
    expect(screenForPath("/depo/stok")?.code).toBe("MB-ZIM");
    expect(screenForPath("/kasa/yazici")?.code).toBe("QS-FIS");
    expect(screenForPath("/kasa/masa/3")?.code).toBe("QS-KAS");
    expect(screenForPath("/katman")).toBeUndefined();
    expect(screenForPath("/bilinmeyen")).toBeUndefined();
  });
});
