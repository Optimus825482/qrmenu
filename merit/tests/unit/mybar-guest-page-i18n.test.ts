import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/locales";
import { ROOM_CLOSED_MESSAGES } from "@/modules/mybar/server/roomGuest";

type Tree = { [k: string]: string | Tree };
const root = path.resolve(__dirname, "../..");

function load(locale: string): Tree {
  return JSON.parse(readFileSync(path.join(root, `src/lib/i18n/messages/${locale}.json`), "utf8"));
}
function flat(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === "string") out.set(`${prefix}${k}`, v);
    else for (const [ck, cv] of flat(v, `${prefix}${k}.`)) out.set(ck, cv);
  }
  return out;
}
const mybar = (locale: string) => flat((load(locale) as { mybar: Tree }).mybar);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sources(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("MyBar misafir sayfası mesajları", () => {
  const baseKeys = [...mybar("tr").keys()].sort();

  it("5 ana dil (TR EN DE RU AR) ve diğer misafir dilleri aynı anahtar kümesine sahip, değerler boş değil", () => {
    expect(baseKeys.length).toBeGreaterThan(40);
    for (const locale of LOCALES) {
      const m = mybar(locale);
      expect([...m.keys()].sort(), locale).toEqual(baseKeys);
      for (const [k, v] of m) expect(v.trim(), `${locale}:${k}`).not.toBe("");
    }
  });

  it("kapalı oda nedenlerinin tamamı (ODA_BOS dahil) her dilde mevcut", () => {
    for (const reason of Object.keys(ROOM_CLOSED_MESSAGES)) {
      for (const locale of LOCALES) expect(mybar(locale).has(`unavailable.${reason}`), `${locale}:${reason}`).toBe(true);
    }
  });

  it("arayüzde kullanılan her mybar anahtarı tanımlı", () => {
    const files = [
      ...sources(path.join(root, "src/modules/mybar/ui/guest")),
      path.join(root, "src/app/(guest)/q/[token]/layout.tsx"),
    ];
    const used = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(20);
    for (const key of used) expect(baseKeys, key).toContain(key);
    // template keys: status.<S>, statusDesc.<S>, unavailable.<R> and the error keys of the form
    for (const s of ["BEKLIYOR", "GORULDU", "KARSILANDI", "IPTAL"]) {
      expect(baseKeys).toContain(`status.${s}`);
      expect(baseKeys).toContain(`statusDesc.${s}`);
    }
    for (const k of ["validationEmpty", "err409Daily", "errRate", "errNetwork", "errGeneric", "errItems", "errClosed"]) {
      expect(baseKeys).toContain(k);
    }
  });

  it("sepet/ödeme/fiyat dili yok; Arapça metin Arapça harf içerir", () => {
    const all = (l: string) => [...mybar(l).values()].join(" ").toLowerCase();
    expect(all("tr")).not.toMatch(/sepet|satın al|ödeme|fiyat/);
    expect(all("en")).not.toMatch(/\bcart\b|basket|checkout|\bpay|price/);
    expect(mybar("ar").get("noteLabel")).toMatch(/[؀-ۿ]/);
    expect(mybar("ru").get("noteLabel")).toMatch(/[Ѐ-ӿ]/);
  });

  it("not sayacı 500 sınırını kullanır; yer tutucular tüm dillerde korunur", () => {
    for (const locale of LOCALES) {
      const m = mybar(locale);
      expect(m.get("noteCounter"), locale).toBe("{count}/{max}");
      expect(m.get("subtitle"), locale).toContain("{hotel}");
      expect(m.get("removeItem"), locale).toContain("{name}");
      expect(m.get("increase"), locale).toContain("{name}");
      expect(m.get("liveRegion"), locale).toContain("{status}");
    }
  });
});
