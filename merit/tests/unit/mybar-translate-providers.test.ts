import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

type Config = { deeplKey?: string; geminiKey?: string; provider: "AUTO" | "DEEPL" | "GEMINI"; geminiModel: string };
const config: { current: Config } = { current: { provider: "AUTO", geminiModel: "gemini-3.8-flash" } };
vi.mock("@/modules/menu/server/translations", () => ({
  loadTranslationConfig: async () => config.current,
}));

const { deeplProvider } = await import("@/modules/mybar/server/translate/deepl");
const { geminiProvider } = await import("@/modules/mybar/server/translate/gemini");
const { resolveTranslationProviders, resetTranslationProviderCacheForTests } = await import(
  "@/modules/mybar/server/translate"
);
const { translateNoteForStaff, warmTranslations, resetTranslationMemoryForTests } = await import(
  "@/modules/mybar/server/translateService"
);

const signal = () => new AbortController().signal;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const geminiBody = (payload: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] });

let hid: string;
beforeAll(async () => {
  await resetReferenceData();
  hid = await hotelId("DIAMOND");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
beforeEach(async () => {
  config.current = { provider: "AUTO", geminiModel: "gemini-3.8-flash" };
  resetTranslationProviderCacheForTests();
  resetTranslationMemoryForTests();
  await testDb.textTranslation.deleteMany();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("deeplProvider", () => {
  it("ucretsiz anahtarla api-free ucuna gider, dili ve metni gonderir", async () => {
    const fetchMock = vi.fn(async () => json({ translations: [{ text: "Su istiyorum", detected_source_language: "EN" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await deeplProvider("abc:fx").translate("I want water", { to: "tr", signal: signal() });
    expect(result).toEqual({ text: "Su istiyorum", sourceLang: "en", translated: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-free.deepl.com/v2/translate");
    const body = init.body as URLSearchParams;
    expect(body.get("target_lang")).toBe("TR");
    expect(body.get("text")).toBe("I want water");
    expect(body.has("source_lang")).toBe(false);
  });

  it("ucretli anahtar api ucunu kullanir; kaynak dil verilirse gonderilir", async () => {
    const fetchMock = vi.fn(async () => json({ translations: [{ text: "Water", detected_source_language: "TR" }] }));
    vi.stubGlobal("fetch", fetchMock);
    await deeplProvider("abc").translate("Su", { to: "en", from: "tr", signal: signal() });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepl.com/v2/translate");
    expect((init.body as URLSearchParams).get("source_lang")).toBe("TR");
    expect((init.body as URLSearchParams).get("target_lang")).toBe("EN-GB");
  });

  it("metin zaten hedef dildeyse cevrilmedi sayilir; HTTP hatasi firlatir", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ translations: [{ text: "Su", detected_source_language: "TR" }] })));
    expect((await deeplProvider("k").translate("Su", { to: "tr", signal: signal() })).translated).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 456)));
    await expect(deeplProvider("k").translate("Su", { to: "en", signal: signal() })).rejects.toThrow("deepl HTTP 456");
  });
});

describe("geminiProvider", () => {
  it("modeli ve anahtari gonderir, JSON yanitini cozer", async () => {
    const fetchMock = vi.fn(async () => json(geminiBody({ sourceLang: "de", text: "Su lütfen" })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await geminiProvider("key-1", "gemini-3.8-flash").translate("Wasser bitte", { to: "tr", signal: signal() });
    expect(result).toEqual({ text: "Su lütfen", sourceLang: "de", translated: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/gemini-3.8-flash:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("key-1");
    // The guest text travels as a JSON value inside the prompt, not as free instructions.
    expect(String(init.body)).toContain(JSON.stringify(JSON.stringify({ text: "Wasser bitte" })).slice(1, -1));
  });

  it("gecersiz yanit hata verir", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(geminiBody({ nope: 1 }))));
    await expect(geminiProvider("k", "m").translate("x", { to: "tr", signal: signal() })).rejects.toThrow();
  });
});

describe("resolveTranslationProviders", () => {
  const names = async () => (await resolveTranslationProviders()).map((p) => p.name);

  it("anahtar yoksa ceviri kapali", async () => {
    expect(await names()).toEqual([]);
  });

  it("AUTO: once DeepL sonra Gemini", async () => {
    config.current = { provider: "AUTO", deeplKey: "d", geminiKey: "g", geminiModel: "gemini-3.8-flash" };
    expect(await names()).toEqual(["deepl", "gemini"]);
  });

  it("secili saglayici tek basina kullanilir; anahtari yoksa zincir bos kalir", async () => {
    config.current = { provider: "GEMINI", deeplKey: "d", geminiKey: "g", geminiModel: "gemini-3.8-flash" };
    expect(await names()).toEqual(["gemini"]);
    resetTranslationProviderCacheForTests();
    config.current = { provider: "DEEPL", geminiKey: "g", geminiModel: "gemini-3.8-flash" };
    expect(await names()).toEqual([]);
  });
});

describe("zincir", () => {
  it("DeepL hata verirse misafir notu Gemini ile cevrilir", async () => {
    config.current = { provider: "AUTO", deeplKey: "d", geminiKey: "g", geminiModel: "gemini-3.8-flash" };
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("deepl.com") ? json({}, 500) : json(geminiBody({ sourceLang: "en", text: "Fazladan su lütfen" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await translateNoteForStaff(hid, "Extra water please")).toEqual({ noteTr: "Fazladan su lütfen", srcLang: "en" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("urun adi onbellege, ceviriyi yapan saglayicinin adiyla yazilir", async () => {
    config.current = { provider: "DEEPL", deeplKey: "d", geminiModel: "gemini-3.8-flash" };
    vi.stubGlobal("fetch", vi.fn(async () => json({ translations: [{ text: "Water", detected_source_language: "TR" }] })));
    expect(await warmTranslations(["Su"], "en")).toBe(1);
    const row = await testDb.textTranslation.findFirstOrThrow({ where: { targetLang: "en" } });
    expect(row).toMatchObject({ sourceText: "Su", translated: "Water", provider: "deepl" });
  });

  it("butun saglayicilar basarisizsa talep engellenmez (bos doner)", async () => {
    config.current = { provider: "AUTO", deeplKey: "d", geminiKey: "g", geminiModel: "gemini-3.8-flash" };
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
    expect(await translateNoteForStaff(hid, "Extra water please")).toEqual({ noteTr: null, srcLang: null });
  });
});
