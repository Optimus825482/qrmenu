import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isRtl, LOCALES, pickLocale } from "@/lib/i18n/locales";

type Tree = { [k: string]: string | Tree };

function load(locale: string): Tree {
  return JSON.parse(readFileSync(path.resolve(__dirname, `../../src/lib/i18n/messages/${locale}.json`), "utf8"));
}
function flatten(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : flatten(v, `${prefix}${k}.`),
  );
}

describe("mesaj dosyaları", () => {
  const sets = LOCALES.map((l) => [l, flatten(load(l))] as const);
  const base = sets[0][1].map(([k]) => k).sort();

  it("desteklenen dillerin anahtar kümeleri eşit", () => {
    for (const [locale, entries] of sets) {
      expect(entries.map(([k]) => k).sort(), locale).toEqual(base);
    }
  });

  it("zorunlu anahtarlar var ve değerler boş değil", () => {
    for (const key of [
      "guest.menu.title",
      "guest.menu.orderingClosed",
      "guest.menu.soldOut",
      "guest.cart.title",
      "guest.cart.add",
      "guest.cart.submit",
      "guest.order.status.GONDERILDI",
      "guest.order.status.SERVIS_EDILDI",
      "guest.order.status.TEYIT_BEKLIYOR",
      "guest.order.status.YOLDA",
      "guest.order.status.TESLIM_EDILDI",
      "guest.room.card.roomService",
      "guest.room.card.roomServiceHint",
      "guest.rs.menu.title",
      "guest.rs.selections.submit",
      "guest.rs.limit",
      "guest.rs.order.status.TEYIT_BEKLIYOR",
      "guest.rs.order.status.ONAYLANDI",
      "guest.rs.order.status.HAZIR",
      "guest.rs.order.status.YOLDA",
      "guest.rs.order.status.TESLIM_EDILDI",
      "guest.rs.order.status.IPTAL",
      "guest.rs.order.confirmHint",
      "guest.rs.order.eta",
      "guest.rs.order.cancel",
      "guest.rs.order.cancelConfirm",
      "guest.rs.order.cancelled",
      "guest.allergen.deniz_urunu",
      "guest.unavailable.title",
      "guest.unavailable.BILINMEYEN",
      "guest.unavailable.RATE_LIMITED",
      "guest.unavailable.HATA",
    ]) {
      expect(base, key).toContain(key);
    }
    for (const [locale, entries] of sets) {
      for (const [k, v] of entries) expect(v.trim(), `${locale}:${k}`).not.toBe("");
    }
  });

  it("kullanılmayan oda yer tutucusu yok", () => {
    expect(base).not.toContain("guest.room.placeholder");
  });

  it("oda servisi süre tahmini dakika parametresini kullanır", () => {
    for (const [locale, entries] of sets) {
      const eta = entries.find(([key]) => key === "guest.rs.order.eta")?.[1] ?? "";
      expect(eta, locale).toContain("{min}");
    }
  });

  it("sepet ve ödeme terimi yok; Seçimler dili kullanılır", () => {
    const text = (l: string) => flatten(load(l)).map(([, v]) => v).join(" ").toLowerCase();
    expect(text("tr")).not.toMatch(/sepet|satın al|ödeme/);
    expect(text("en")).not.toMatch(/\bcart\b|basket|checkout|\bpay/);
    const tr = load("tr") as { guest: { cart: Record<string, string> } };
    expect(tr.guest.cart).toMatchObject({
      title: "Seçimlerim",
      add: "Seçimlere ekle",
      submit: "Seçimleri gönder",
      empty: "Henüz seçim yapmadınız",
    });
  });
});

describe("pickLocale", () => {
  it("sıra: query, cookie, Accept-Language, en", () => {
    expect(pickLocale({ query: "de" })).toBe("de");
    expect(pickLocale({ cookie: "ar" })).toBe("ar");
    expect(pickLocale({ acceptLanguage: "ru-RU,ru;q=0.9" })).toBe("ru");
    expect(pickLocale({ acceptLanguage: "fr" })).toBe("fr");
    expect(pickLocale({ acceptLanguage: "el" })).toBe("el");
    expect(pickLocale({ acceptLanguage: "it" })).toBe("it");
    expect(pickLocale({ query: "tr", cookie: "ar", acceptLanguage: "de" })).toBe("tr");
    expect(pickLocale({ query: "xx", cookie: "ar" })).toBe("ar");
    expect(pickLocale({ cookie: "zz", acceptLanguage: "de-DE,en;q=0.8" })).toBe("de");
    expect(pickLocale({})).toBe(DEFAULT_LOCALE);
  });

  it("Accept-Language q değerine göre sıralanır; bozuk girdi en'e düşer", () => {
    expect(pickLocale({ acceptLanguage: "fr;q=0.9,tr;q=0.5,de;q=0.7" })).toBe("fr");
    expect(pickLocale({ acceptLanguage: ";;;,q=x" })).toBe("en");
    expect(pickLocale({ acceptLanguage: "AR-sa" })).toBe("ar");
  });

  it("yalnız ar sağdan sola", () => {
    expect(isRtl("ar")).toBe(true);
    expect(LOCALES.filter(isRtl)).toEqual(["ar"]);
  });
});
