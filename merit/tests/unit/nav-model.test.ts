import { describe, expect, it } from "vitest";
import legacy from "../fixtures/legacy-nav.json";
import { buildNav, isRailNav, navFamilies, type NavModel } from "@/components/staff/navModel";
import { screenForPath } from "@/modules/core/screenPaths";
import { SCREENS } from "@/modules/core/screens";

const ALL = new Set(SCREENS.map((s) => s.code));
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

/** The screens each seeded floor role may view (visibleScreens of the seeded matrix), recorded with the nav the role-code based builder gave. */
const FOR: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(legacy.SETS).map(([role, codes]) => [role, new Set(codes.split(","))]),
);
const minus = (set: ReadonlySet<string>, ...codes: string[]) => new Set([...set].filter((c) => !codes.includes(c)));
const MANAGER = new Set([...FOR["R-KAT"], ...FOR["R-DEP"], ...FOR["R-GAR"], ...FOR["R-SGF"], ...FOR["R-ODS"]]);

describe("buildNav — kat sorumlusu", () => {
  it("tüm ekranlarla: Bugün · Katlar · QR Okut · İşlemlerim · Daha, QR ortada vurgulu", () => {
    const nav = buildNav(FOR["R-KAT"]);
    expect(labels(nav.primary)).toEqual(["Bugün", "Katlar", "QR Okut", "İşlemlerim", "Daha"]);
    expect(nav.primary[2].emphasis).toBe("qr");
    expect(nav.primary[2].href).toBe("/kat/qr");
    expect(nav.primary[0].href).toBe("/kat/tavsiye-is-plani");
  });

  it("MB-KF görünmezse QR Okut çıkmaz, en az iki öğe kalır", () => {
    const nav = buildNav(minus(FOR["R-KAT"], "MB-KF"));
    expect(labels(nav.primary)).not.toContain("QR Okut");
    expect(nav.primary.length).toBeGreaterThanOrEqual(2);
    expect(nav.primary.some((i) => i.emphasis === "qr")).toBe(false);
  });
});

describe("buildNav — depo", () => {
  it("R-DEP tüm ekranlarla: Otel deposu · Talepler · Raporlar · Daha", () => {
    const nav = buildNav(FOR["R-DEP"]);
    expect(labels(nav.primary)).toEqual(["Otel deposu", "Talepler", "Raporlar", "Daha"]);
    expect(nav.primary[0].href).toBe("/depo/stok");
    expect(nav.primary[1].href).toBe("/kat/duzeltme-onay");
  });

  it("ikinci otelde MB-ZIM yoksa Havuz çıkmaz; more yalnız görünür ekranları içerir", () => {
    const visible = minus(FOR["R-DEP"], "MB-ZIM");
    const nav = buildNav(visible);
    expect(labels(nav.primary)).not.toContain("Otel deposu");
    expect(labels(nav.more)).not.toContain("Otel deposu");
    for (const item of allItems(nav)) expect(visible.has(item.screen)).toBe(true);
  });

  it("R-HKS aynı depo gezinmesini kullanır", () => {
    expect(labels(buildNav(FOR["R-HKS"]).primary)).toEqual(["Otel deposu", "Talepler", "Raporlar", "Daha"]);
  });
});

describe("buildNav — garson ve oda servisi", () => {
  it("garson rolleri: Kuyruk · Masalarım · Çağrılar · Daha", () => {
    for (const role of ["R-GAR", "R-SGF", "R-BAR", "R-BUT"]) {
      const nav = buildNav(FOR[role]);
      // The seeded barman and butler have no QM-CAG.
      expect(labels(nav.primary)).toEqual(["R-BAR", "R-BUT"].includes(role) ? ["Kuyruk", "Masalarım", "Daha"] : ["Kuyruk", "Masalarım", "Çağrılar", "Daha"]);
      expect(nav.primary[1].href).toBe("/garson?sekme=masalar");
    }
  });

  it("FAB yalnız QS-KUY görünürken ve oluşturma yetkisi varken", () => {
    expect(buildNav(FOR["R-GAR"], { canCreate: true }).fab?.label).toBe("Yeni adisyon");
    expect(buildNav(FOR["R-GAR"]).fab).toBeUndefined();
    expect(buildNav(FOR["R-GAR"], { canCreate: false }).fab).toBeUndefined();
    expect(buildNav(minus(FOR["R-GAR"], "QS-KUY"), { canCreate: true }).fab).toBeUndefined();
  });

  it("QM-CAG görünmezse (barmen) Çağrılar çıkmaz", () => {
    expect(labels(buildNav(minus(FOR["R-BAR"], "QM-CAG")).primary)).toEqual(["Kuyruk", "Masalarım", "Daha"]);
  });

  it("oda servisi: Talepler · Teslim · Daha", () => {
    const nav = buildNav(FOR["R-ODS"]);
    expect(labels(nav.primary)).toEqual(["Talepler", "Teslim", "Daha"]);
  });

  it("birden çok aileye yetkili kullanıcı (yönetim) yolun ailesini öne alır, kalanını Daha'da görür", () => {
    expect(navFamilies(MANAGER, "/oda-servisi")).toEqual(["ods", "depo"]);
    const ods = buildNav(MANAGER, { pathname: "/oda-servisi" });
    expect(labels(ods.primary)).toEqual(["Talepler", "Teslim", "Daha"]);
    expect(ods.more.length).toBeGreaterThan(0);
    const garson = buildNav(MANAGER, { pathname: "/garson" });
    expect(labels(garson.primary)).toEqual(["Kuyruk", "Masalarım", "Çağrılar", "Daha"]);
    // Union: the other families' links are reachable, once each.
    const hrefs = [...garson.primary, ...garson.more].filter((i) => i.href).map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(expect.arrayContaining(["/depo/stok", "/oda-servisi", "/kat"]));
    // No path: the first family in catalogue order leads, still a usable menu (no dependence on the role).
    expect(buildNav(MANAGER).primary.length).toBeGreaterThanOrEqual(2);
  });

  it("yalnız kat ekranları verilmiş özel rol kat bağlantılarını görür", () => {
    const custom = new Set(["MB-KAT", "MB-KF", "MB-TUK", "CR-RAP"]);
    expect(navFamilies(custom)).toEqual(["kat"]);
    expect(labels(buildNav(custom).primary)).toEqual(["Bugün", "Katlar", "QR Okut", "İşlemlerim", "Daha"]);
    expect(isRailNav(custom)).toBe(false);
  });

  it("yetki kalkınca (kullanıcı istisnası / kapalı modül = ekran görünmez) bağlantı kaybolur", () => {
    const base = buildNav(FOR["R-KAT"]);
    expect([...base.primary, ...base.more].map((i) => i.href)).toContain("/kat/stok");
    const gone = buildNav(minus(FOR["R-KAT"], "MB-ZIM"));
    expect([...gone.primary, ...gone.more].map((i) => i.href)).not.toContain("/kat/stok");
    expect(buildNav(minus(FOR["R-KAT"], "MB-KAT", "MB-KF", "MB-TUK")).primary).toEqual([]);
  });
});

describe("buildNav — bugünkü roller yetkiden türetilince birebir aynı", () => {
  it("rol kodu bazlı eski çıktı ile aynı: çubuk, Daha, FAB (yolsuz ve yollu)", () => {
    for (const [key, expected] of Object.entries(legacy.out)) {
      const [role, path, cc] = key.split("|");
      // The old builder answered an empty menu to a role that sat on a page of a family it has no screens in
      // (a waiter on /oda-servisi); the menu of the role's own family is shown now. Everything else is pinned.
      if (expected.p.length === 0) continue;
      const nav = buildNav(FOR[role], { pathname: path || undefined, canCreate: cc === "true" });
      const got = { p: nav.primary.map((i) => i.href || "more"), m: nav.more.map((i) => i.href), f: nav.fab?.href ?? null };
      expect(got, key).toEqual(expected);
    }
  });

  it("ray düzeni yalnız yalnızca-depo kullanıcısında", () => {
    expect(isRailNav(FOR["R-DEP"])).toBe(true);
    expect(isRailNav(FOR["R-HKS"])).toBe(true);
    for (const role of ["R-KAT", "R-ODS", "R-GAR", "R-SGF", "R-BAR", "R-BUT"]) expect(isRailNav(FOR[role]), role).toBe(false);
    expect(isRailNav(MANAGER)).toBe(false);
  });
});

describe("buildNav — özellikler", () => {
  it("görünür ekran yoksa model boştur", () => {
    const nav = buildNav(new Set());
    expect(nav.primary).toEqual([]);
    expect(nav.more).toEqual([]);
    expect(nav.fab).toBeUndefined();
  });

  it("200 rastgele görünür küme: hiçbir bağlantı görünmeyen ekrana gitmez, öğe sayısı 2–5", () => {
    for (const role of ["rastgele"]) {
      for (let seed = 1; seed <= 200; seed++) {
        const visible = randomVisible(seed * 7919);
        const nav = buildNav(visible, { canCreate: true });
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
