import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import legacy from "../fixtures/legacy-nav.json";
import { decideBack, isFrameFirstScreen } from "@/components/staff/BackLink";
import {
  backTarget,
  canViewPath,
  guardsOfPath,
  homeFor,
  isNavRoot,
  pathOfHref,
  withContext,
  withQuery,
} from "@/components/staff/backTarget";
import { previousEntryKey } from "@/shell/FrameOwnBack";
import { SCREENS } from "@/modules/core/screens";

const FOR: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(legacy.SETS).map(([role, codes]) => [role, new Set(codes.split(","))]),
);
const ALL = [...new Set(SCREENS.map((s) => s.code))].filter((c) => c.startsWith("MB-"));

/** Every staff (minibar) route, with a sample id for the dynamic segments. */
const ROUTES = [
  "/kat",
  "/kat/dnd",
  "/kat/doluluk/f1",
  "/kat/duzeltme-onay",
  "/kat/gorevler",
  "/kat/islemlerim",
  "/kat/kritik",
  "/kat/manuel-kayit",
  "/kat/mybar",
  "/kat/oda-kontrol/r1",
  "/kat/qr",
  "/kat/stok",
  "/kat/talep",
  "/kat/tavsiye-is-plani",
  "/kat/urun/p1",
  "/kat/urun-siralamasi",
  "/depo",
  "/depo/doluluk-yukle",
  "/depo/gorevler",
  "/depo/mybar",
  "/depo/raporlar",
  "/depo/stok",
  "/depo/talepler",
  "/depo/tanimlar",
  "/depo/tedarik",
];

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

/** Layout files of the kat / depo routes and the screen each one checks. */
function layoutGuards(): Array<{ route: string; code: string }> {
  const root = path.resolve(__dirname, "../../src/app");
  const found: Array<{ route: string; code: string }> = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "layout.tsx") {
        const code = /requireScreen\("([A-Z-]+)"\)/.exec(readFileSync(full, "utf8"))?.[1];
        if (!code) continue;
        const route = `/${path.relative(root, dir).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).map((s) => (s.startsWith("[") ? "x" : s)).join("/")}`;
        found.push({ route, code });
      }
    }
  };
  walk(path.join(root, "kat"));
  walk(path.join(root, "depo"));
  return found;
}

describe("guardsOfPath = the layouts' requireScreen", () => {
  it("every guarded kat / depo layout is in the table with the same screen", () => {
    const layouts = layoutGuards();
    expect(layouts.length).toBeGreaterThan(20);
    for (const { route, code } of layouts) expect([route, guardsOfPath(route)]).toEqual([route, [code]]);
  });

  it("routes outside the table are not judged", () => {
    expect(guardsOfPath("/baslat")).toBeUndefined();
    expect(canViewPath(new Set(), "/erisimim")).toBe(true);
    expect(canViewPath(new Set(), "/kat/oda-kontrol/r1?x=1")).toBe(false);
  });
});

describe("backTarget — R-KAT", () => {
  const visible = FOR["R-KAT"];

  it("bar entries and the family home show no Geri", () => {
    for (const root of ["/kat", "/kat/tavsiye-is-plani", "/kat/qr", "/kat/islemlerim"]) {
      expect([root, backTarget({ pathname: root, visible }).kind]).toEqual([root, "root"]);
    }
  });

  it("logical parents", () => {
    const href = (pathname: string, search = "", parent?: string) => {
      const t = backTarget({ pathname, search, visible, parent });
      return t.kind === "back" ? t.href : t.kind;
    };
    expect(href("/kat/doluluk/f1")).toBe("/kat");
    expect(href("/kat/oda-kontrol/r1", "", "/kat/doluluk/f1")).toBe("/kat/doluluk/f1");
    expect(href("/kat/kritik")).toBe("/kat/stok");
    expect(href("/kat/urun/p1")).toBe("/kat/stok");
    expect(href("/kat/talep")).toBe("/kat/duzeltme-onay");
    expect(href("/kat/duzeltme-onay")).toBe("/kat/islemlerim");
    expect(href("/kat/manuel-kayit", "kat=f1")).toBe("/kat/doluluk/f1");
    expect(href("/kat/manuel-kayit", "oda=r1")).toBe("/kat/oda-kontrol/r1");
    expect(href("/kat/manuel-kayit")).toBe("/kat/islemlerim");
    expect(href("/kat/stok")).toBe("/kat");
  });

  it("the room page leads to its floor, labelled by the page name", () => {
    const t = backTarget({ pathname: "/kat/oda-kontrol/r1", visible, parent: "/kat/doluluk/f1" });
    expect(t).toEqual({ kind: "back", href: "/kat/doluluk/f1", label: "Kat" });
  });

  it("keeps the hotel of the address, never on the sign-in landing", () => {
    const t = backTarget({ pathname: "/kat/doluluk/f1", search: "hotelId=h2", visible });
    expect(t.kind === "back" && t.href).toBe("/kat?hotelId=h2");
    expect(withContext("/baslat", new URLSearchParams("hotelId=h2"))).toBe("/baslat");
    expect(withContext("/kat?hotelId=h1", new URLSearchParams("hotelId=h2"))).toBe("/kat?hotelId=h1");
  });
});

describe("backTarget — depo family", () => {
  it("shared kat pages lead to the depot board for a depot user", () => {
    const visible = FOR["R-DEP"];
    const t = backTarget({ pathname: "/kat/gorevler", visible });
    expect(t.kind === "back" && pathOfHref(t.href)).toBe("/depo");
    const tedarik = backTarget({ pathname: "/depo/tedarik", visible });
    expect(tedarik.kind === "back" && tedarik.href).toBe("/depo/stok");
  });
});

describe("backTarget never leads to a screen the user cannot open", () => {
  it("parent not viewable → home", () => {
    // Stock without the floor plan: the critical list goes to the stock page, a floor sub-page goes home.
    const visible = new Set(["MB-ZIM"]);
    const t = backTarget({ pathname: "/kat/kritik", visible });
    expect(t.kind === "back" && t.href).toBe("/kat/stok");
    const visibleNoStock = new Set(["MB-TUK"]);
    const u = backTarget({ pathname: "/kat/oda-kontrol/r1", visible: visibleNoStock, parent: "/kat/doluluk/f1" });
    expect(u.kind).toBe("back");
    if (u.kind === "back") {
      expect(canViewPath(visibleNoStock, u.href)).toBe(true);
      expect(pathOfHref(u.href)).not.toBe("/kat/doluluk/f1");
    }
  });

  it("random permission sets: always viewable, never /yetkisiz, never the page itself", () => {
    const rand = rng(7);
    for (let n = 0; n < 300; n++) {
      const density = rand();
      const visible = new Set(ALL.filter(() => rand() < density));
      for (const route of ROUTES) {
        const t = backTarget({ pathname: route, search: "hotelId=h1", visible });
        if (t.kind === "root") continue;
        const target = pathOfHref(t.href);
        expect(target).not.toBe("/yetkisiz");
        expect(target).not.toBe(route);
        expect([route, [...visible].join(","), t.href, canViewPath(visible, t.href)]).toEqual([route, [...visible].join(","), t.href, true]);
      }
      const home = homeFor(visible, "/kat");
      expect(home === "/baslat" || canViewPath(visible, home)).toBe(true);
    }
  });

  it("a root is a root only for the user's own family", () => {
    expect(isNavRoot(FOR["R-KAT"], "/kat/islemlerim")).toBe(true);
    expect(isNavRoot(FOR["R-KAT"], "/kat/doluluk/f1")).toBe(false);
  });
});

describe("decideBack", () => {
  const visible = FOR["R-KAT"];
  const base = { search: "", visible, inFrame: false, frameSrc: "", frameHasHistory: false };

  it("outside a frame: none on a root, the parent elsewhere", () => {
    expect(decideBack({ ...base, pathname: "/kat" })).toEqual({ render: false });
    expect(decideBack({ ...base, pathname: "/kat/doluluk/f1" })).toEqual({
      render: true,
      href: "/kat",
      label: "Kat Planı",
      mode: "step-or-replace",
    });
  });

  it("without the screen list (outside a kat / depo layout) and no parent: nothing", () => {
    expect(decideBack({ ...base, visible: null, pathname: "/kat/doluluk/f1" })).toEqual({ render: false });
  });

  it("in a shell window: none on its first screen, a step back deeper", () => {
    const frame = { ...base, inFrame: true, frameSrc: "/kat/stok?font=m&theme=light" };
    expect(isFrameFirstScreen("/kat/stok", frame.frameSrc)).toBe(true);
    expect(decideBack({ ...frame, pathname: "/kat/stok" })).toEqual({ render: false });
    const deeper = decideBack({ ...frame, pathname: "/kat/kritik", frameHasHistory: true });
    expect(deeper).toMatchObject({ render: true, href: "/kat/stok", mode: "frame-back" });
  });
});

describe("previousEntryKey (stepBackIfPrevious)", () => {
  const origin = "https://merit.test";
  const entries = [
    { url: `${origin}/kat?hotelId=h1`, key: "a" },
    { url: `${origin}/kat/doluluk/f1?hotelId=h1`, key: "b" },
    { url: `${origin}/kat/oda-kontrol/r1?hotelId=h1`, key: "c" },
  ] as unknown as Parameters<typeof previousEntryKey>[0];

  it("finds the parent among the entries just behind", () => {
    expect(previousEntryKey(entries, 2, "/kat/doluluk/f1?hotelId=h1", origin)).toBe("b");
    expect(previousEntryKey(entries, 2, "/kat/doluluk/f1", origin)).toBe("b");
  });

  it("another hotel or another page is not the parent", () => {
    expect(previousEntryKey(entries, 2, "/kat/doluluk/f1?hotelId=h2", origin)).toBeNull();
    expect(previousEntryKey(entries, 2, "/kat/stok", origin)).toBeNull();
  });
});

describe("withQuery (redirects keep the address)", () => {
  it("copies every key", () => {
    expect(withQuery("/depo/stok", { hotelId: "h1", font: "m", x: undefined })).toBe("/depo/stok?hotelId=h1&font=m");
    expect(withQuery("/depo/stok", {})).toBe("/depo/stok");
  });
});
