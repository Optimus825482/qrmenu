import { describe, expect, it } from "vitest";
import { buildNav, type NavModel } from "@/components/staff/navModel";
import { screenForPath } from "@/modules/core/screenPaths";
import { SCREENS } from "@/modules/core/screens";

const ALL = new Set(SCREENS.map((s) => s.code));
const without = (...codes: string[]) => new Set([...ALL].filter((c) => !codes.includes(c)));
const labels = (items: { label: string }[]) => items.map((i) => i.label);

/** Deterministic pseudo-random subsets (mulberry32) so a failure is reproducible. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomVisible(seed: number): Set<string> {
  const rand = rng(seed);
  const density = rand();
  return new Set([...ALL].filter(() => rand() < density));
}
function allItems(nav: NavModel) {
  return [...nav.primary, ...nav.more, ...(nav.fab ? [nav.fab] : [])].filter((i) => i.href);
}

const ROLES = ["R-KAT", "R-GAR", "R-SGF", "R-BAR", "R-BUT", "R-ODS", "R-DEP", "R-HKS"];

describe("buildNav — kat sorumlusu", () => {
  it("tüm ekranlarla: Bugün · Katlar · QR Okut · İşlemlerim · Daha, QR ortada vurgulu", () => {
    const nav = buildNav("R-KAT", ALL);
    expect(labels(nav.primary)).toEqual(["Bugün", "Katlar", "QR Okut", "İşlemlerim", "Daha"]);
    expect(nav.primary[2].emphasis).toBe("qr");
    expect(nav.primary[2].href).toBe("/kat/qr");
    expect(nav.primary[0].href).toBe("/kat/tavsiye-is-plani");
  });

  it("MB-KF görünmezse QR Okut çıkmaz, en az iki öğe kalır", () => {
    const nav = buildNav("R-KAT", without("MB-KF"));
    expect(labels(nav.primary)).not.toContain("QR Okut");
    expect(nav.primary.length).toBeGreaterThanOrEqual(2);
    expect(nav.primary.some((i) => i.emphasis === "qr")).toBe(false);
  });
});

describe("buildNav — depo", () => {
  it("R-DEP tüm ekranlarla: Otel deposu · Talepler · Raporlar · Daha", () => {
    const nav = buildNav("R-DEP", ALL);
    expect(labels(nav.primary)).toEqual(["Otel deposu", "Talepler", "Raporlar", "Daha"]);
    expect(nav.primary[0].href).toBe("/depo/stok");
    expect(nav.primary[1].href).toBe("/kat/duzeltme-onay");
  });

  it("ikinci otelde MB-ZIM yoksa Havuz çıkmaz; more yalnız görünür ekranları içerir", () => {
    const visible = without("MB-ZIM");
    const nav = buildNav("R-DEP", visible);
    expect(labels(nav.primary)).not.toContain("Otel deposu");
    expect(labels(nav.more)).not.toContain("Otel deposu");
    for (const item of allItems(nav)) expect(visible.has(item.screen)).toBe(true);
  });

  it("R-HKS aynı depo gezinmesini kullanır", () => {
    expect(labels(buildNav("R-HKS", ALL).primary)).toEqual(["Otel deposu", "Talepler", "Raporlar", "Daha"]);
  });
});

describe("buildNav — garson ve oda servisi", () => {
  it("garson rolleri: Kuyruk · Masalarım · Çağrılar · Daha", () => {
    for (const role of ["R-GAR", "R-SGF", "R-BAR", "R-BUT"]) {
      const nav = buildNav(role, ALL);
      expect(labels(nav.primary)).toEqual(["Kuyruk", "Masalarım", "Çağrılar", "Daha"]);
      expect(nav.primary[1].href).toBe("/garson?sekme=masalar");
    }
  });

  it("FAB yalnız QS-KUY görünürken ve oluşturma yetkisi varken", () => {
    expect(buildNav("R-GAR", ALL, { canCreate: true }).fab?.label).toBe("Yeni adisyon");
    expect(buildNav("R-GAR", ALL).fab).toBeUndefined();
    expect(buildNav("R-GAR", ALL, { canCreate: false }).fab).toBeUndefined();
    expect(buildNav("R-GAR", without("QS-KUY"), { canCreate: true }).fab).toBeUndefined();
  });

  it("QM-CAG görünmezse (barmen) Çağrılar çıkmaz", () => {
    expect(labels(buildNav("R-BAR", without("QM-CAG")).primary)).toEqual(["Kuyruk", "Masalarım", "Daha"]);
  });

  it("oda servisi: Talepler · Teslim · Daha", () => {
    const nav = buildNav("R-ODS", ALL);
    expect(labels(nav.primary)).toEqual(["Talepler", "Teslim", "Daha"]);
  });

  it("rolü bilinmeyen kullanıcı (F&B müdürü) yola göre gezinme alır", () => {
    expect(labels(buildNav("R-FBM", ALL, { pathname: "/oda-servisi" }).primary)).toEqual(["Talepler", "Teslim", "Daha"]);
    expect(labels(buildNav("R-FBM", ALL, { pathname: "/garson" }).primary)).toEqual(["Kuyruk", "Masalarım", "Çağrılar", "Daha"]);
    expect(buildNav("R-FBM", ALL).primary).toEqual([]);
  });
});

describe("buildNav — özellikler", () => {
  it("görünür ekran yoksa model boştur", () => {
    for (const role of ROLES) {
      const nav = buildNav(role, new Set());
      expect(nav.primary).toEqual([]);
      expect(nav.more).toEqual([]);
      expect(nav.fab).toBeUndefined();
    }
  });

  it("her rol için 50 rastgele görünür küme: hiçbir bağlantı görünmeyen ekrana gitmez, öğe sayısı 2–5", () => {
    for (const role of ROLES) {
      for (let seed = 1; seed <= 50; seed++) {
        const visible = randomVisible(seed * 7919);
        const nav = buildNav(role, visible, { canCreate: true });
        const tag = `${role} #${seed}`;
        for (const item of allItems(nav)) {
          expect(visible.has(item.screen), `${tag}: ${item.label} -> ${item.screen}`).toBe(true);
          const owner = screenForPath(item.href);
          if (owner) expect(visible.has(owner.code), `${tag}: ${item.href} -> ${owner.code}`).toBe(true);
        }
        if (nav.primary.length > 0) {
          expect(nav.primary.length, tag).toBeGreaterThanOrEqual(2);
          expect(nav.primary.length, tag).toBeLessThanOrEqual(5);
          expect(nav.primary.filter((i) => i.id === "more").length, tag).toBeLessThanOrEqual(1);
        }
        const hrefs = [...nav.primary, ...nav.more].filter((i) => i.href).map((i) => i.href);
        expect(new Set(hrefs).size, `${tag}: yinelenen bağlantı`).toBe(hrefs.length);
      }
    }
  });
});
