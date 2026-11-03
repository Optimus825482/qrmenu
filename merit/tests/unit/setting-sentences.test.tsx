import { describe, expect, it } from "vitest";
import { SCREEN_GUIDES } from "@/modules/core/screenGuide";
import { SETTING_SENTENCES, settingSentence, settingSentences } from "@/components/guide/settingSentences";
import { DEFAULT_SETTINGS, SETTING_SCHEMAS, type SettingKey } from "@/lib/settings-defs";

describe("settingSentences", () => {
  it("dnd.minChecks=2 cümlesi değere göre yazılır ve değer değişince değişir", () => {
    expect(settingSentence("dnd.minChecks", 2)).toBe("DND, 2 kontrolde tamamlanır");
    expect(settingSentence("dnd.minChecks", 3)).toBe("DND, 3 kontrolde tamamlanır");
  });

  it("DND bekleme süresi, MyBar günlük sınır ve fiyat gösterimi", () => {
    expect(settingSentence("dnd.recheckMinutes", 120)).toContain("120 dakika");
    expect(settingSentence("mybar.dailyLimit", true)).toBe("MyBar günde 1 kez işlenir");
    expect(settingSentence("mybar.dailyLimit", false)).toContain("birden çok");
    expect(settingSentence("price.display", "HIDE")).toBe("Fiyatlar ekranda gösterilmez");
    expect(settingSentence("price.display", "SHOW")).toBe("Fiyatlar ekranda gösterilir");
  });

  it("anahtarın cümlesi yoksa ya da değer beklenen türde değilse cümle üretilmez", () => {
    expect(settingSentence("qr.baseUrl", "http://x")).toBeNull();
    expect(settingSentence("dnd.minChecks", "iki")).toBeNull();
    expect(settingSentence("price.display", "BELKI")).toBeNull();
    expect(settingSentences({ "dnd.minChecks": 2, "qr.baseUrl": "http://x" })).toEqual(["DND, 2 kontrolde tamamlanır"]);
  });

  it("rehberlerin 'settings' anahtarlarının hepsi geçerli ve cümlesi var; varsayılanlarla cümle çıkar", () => {
    for (const guide of Object.values(SCREEN_GUIDES)) {
      for (const key of guide.settings ?? []) {
        expect(key in SETTING_SCHEMAS, `${guide.code}/${key}`).toBe(true);
        expect(SETTING_SENTENCES[key as SettingKey], `${guide.code}/${key}`).toBeDefined();
        const text = settingSentence(key, DEFAULT_SETTINGS[key]);
        expect(text, `${guide.code}/${key}`).toBeTruthy();
        expect(text).not.toMatch(/sepet|\p{Extended_Pictographic}/iu);
      }
    }
  });
});
