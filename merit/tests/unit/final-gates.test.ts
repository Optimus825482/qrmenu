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
const REQUIRED_ROUTES = [
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
];

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
});
