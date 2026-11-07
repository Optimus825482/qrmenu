import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_AXE_VIOLATIONS, KNOWN_SCROLL, KNOWN_TOUCH_VIOLATIONS, XP_AXE_EXCLUDE } from "../e2e/matrix/knownViolations";
import { ROUTE_MATRIX } from "../e2e/matrix/routes";

/**
 * UX kapanış kapıları (P-UX-15, Task 15): beklenen ihlal listeleri boş, cırcır sayaçları sıfır,
 * XP axe hariç tutma listesi boş ve görünüm matrisi kabul listesindeki tüm rotaları kapsar.
 */
const ratchet = JSON.parse(readFileSync(join(__dirname, "uxRatchet.json"), "utf8")) as {
  smallText: Record<string, number>;
  rawPalette: Record<string, number>;
};

/** Spec P-UX-15 route list; matrix keys that differ from the brief's names are mapped here. */
const REQUIRED_ROUTES: string[] = [
  "kat",
  "kat-oda-kontrol",
  "kat-islemlerim",
  "kat-qr",
  "kat-duzeltme-onay",
  "depo-pano", // brief: depo
  "depo-stok",
  "depo-raporlar",
  "garson",
  "garson-cagrilar",
  "kasa",
  "kasa-yazici",
  "kasa-iptal",
  "kds",
  "oda-servisi",
  "erisimim",
  "yetkisiz",
  "giris",
  "secim",
  "admin",
  "depo-tanimlar", // added by the T15 review: depo/tanimlar was rewritten but missing from the matrix
];

/** Route keys held to a non-default tier; every other route is a staff ("personel") screen. */
const POS_ROUTES = new Set(["kasa", "kasa-yazici", "kasa-iptal", "kds"]);
const XP_ROUTES = new Set(["admin", "radar"]);

describe("UX kapanış kapıları", () => {
  it("KNOWN_TOUCH_VIOLATIONS boş", () => expect(KNOWN_TOUCH_VIOLATIONS).toEqual({}));
  it("KNOWN_AXE_VIOLATIONS boş", () => expect(KNOWN_AXE_VIOLATIONS).toEqual({}));
  it("KNOWN_SCROLL boş", () => expect(KNOWN_SCROLL).toEqual({}));
  it("XP axe hariç tutma listesi boş", () => expect(XP_AXE_EXCLUDE).toEqual([]));

  it("cırcır: küçük yazı ve ham palet sayaçlarının hepsi 0", () => {
    const nonZero = [...Object.entries(ratchet.smallText), ...Object.entries(ratchet.rawPalette)].filter(([, n]) => n !== 0);
    expect(nonZero).toEqual([]);
  });

  it("görünüm matrisi kabul listesindeki tüm rotaları içerir", () => {
    const keys = new Set(ROUTE_MATRIX.map((r) => r.key));
    expect(REQUIRED_ROUTES.filter((k) => !keys.has(k))).toEqual([]);
  });

  it("her rota doğru katmanda: pos (kasa*, kds), xp (admin, radar), kalanı personel", () => {
    // POS entries expose `tier` as a viewport-dependent getter (Playwright only), so the declared tier is read from the source.
    const src = readFileSync(join(__dirname, "..", "e2e", "matrix", "routes.ts"), "utf8");
    const declared = [...src.matchAll(/\{\s*key:\s*"([^"]+)"[^\n]*?\btier:\s*"([^"]+)"/g)].map((m) => ({ key: m[1], tier: m[2] }));
    expect(declared.map((d) => d.key).sort()).toEqual(ROUTE_MATRIX.map((r) => r.key).sort());
    const wrong = declared
      .filter((d) => d.tier !== (POS_ROUTES.has(d.key) ? "pos" : XP_ROUTES.has(d.key) ? "xp" : "personel"))
      .map((d) => `${d.key}: ${d.tier}`);
    expect(wrong).toEqual([]);
    for (const d of declared) expect(["personel", "pos", "xp"]).toContain(d.tier);
  });

  it("axe.spec.ts XP rotalarında yalnız XP_AXE_EXCLUDE'u kullanır (satır içi hariç tutma yok)", () => {
    const src = readFileSync(join(__dirname, "..", "e2e", "matrix", "axe.spec.ts"), "utf8");
    expect(src).toMatch(/exclude:\s*XP_AXE_EXCLUDE/);
    expect(src.match(/exclude\s*:/g) ?? []).toHaveLength(1);
    expect(src).not.toMatch(/\.exclude\(/);
  });
});
