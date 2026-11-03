import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { noneProvider } = await import("@/modules/mybar/server/translate/none");
const { gtxProvider } = await import("@/modules/mybar/server/translate/gtx");
const { getTranslationProvider, setTranslationProviderForTests } = await import(
  "@/modules/mybar/server/translate"
);
const { translateNoteForStaff, localizeTexts, warmTranslations } = await import(
  "@/modules/mybar/server/translateService"
);
type Provider = import("@/modules/mybar/server/translate/provider").TranslationProvider;

function fake(map: Record<string, { text: string; sourceLang: string; translated: boolean }>) {
  const translate = vi.fn(async (text: string) => map[text] ?? { text, sourceLang: "tr", translated: false });
  const provider: Provider = { name: "fake", translate };
  return { provider, translate };
}

let hid: string;
beforeAll(async () => {
  await resetReferenceData();
  hid = await hotelId("DIAMOND");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
beforeEach(async () => {
  await testDb.textTranslation.deleteMany();
  await testDb.setting.deleteMany({ where: { key: "mybar.translateNotes" } });
});
afterEach(() => {
  setTranslationProviderForTests(null);
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("providers", () => {
  it("none returns the text unchanged; default provider is none", async () => {
    const r = await noneProvider.translate("hello", { to: "tr", signal: new AbortController().signal });
    expect(r).toEqual({ text: "hello", sourceLang: "auto", translated: false });
    expect(getTranslationProvider().name).toBe("none");
  });

  it("gtx parses the response and builds the request", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<unknown>>(async () => ({
      ok: true,
      json: async () => [[["merhaba", "hello", null, null, 1]], null, "en"],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await gtxProvider.translate("hello", { to: "tr", signal: new AbortController().signal });
    expect(r).toEqual({ text: "merhaba", sourceLang: "en", translated: true });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("tl=tr");
    expect(url).toContain("q=hello");
  });

  it("gtx reports translated=false when the source is already the target", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [[["su", "su"]], null, "tr"] })));
    const r = await gtxProvider.translate("su", { to: "tr", signal: new AbortController().signal });
    expect(r.translated).toBe(false);
  });
});

describe("translateNoteForStaff", () => {
  it("translates to Turkish", async () => {
    const { provider } = fake({ "more towels": { text: "daha fazla havlu", sourceLang: "en", translated: true } });
    setTranslationProviderForTests(provider);
    expect(await translateNoteForStaff(hid, "more towels")).toEqual({ noteTr: "daha fazla havlu", srcLang: "en" });
  });

  it("does not call the provider when the hotel disabled note translation; other hotels unaffected", async () => {
    const { provider, translate } = fake({ x: { text: "y", sourceLang: "en", translated: true } });
    setTranslationProviderForTests(provider);
    await testDb.setting.create({ data: { key: "mybar.translateNotes", hotelId: hid, value: false } });
    expect(await translateNoteForStaff(hid, "x")).toEqual({ noteTr: null, srcLang: null });
    expect(translate).not.toHaveBeenCalled();
    const other = await testDb.hotel.findFirst({ where: { id: { not: hid } } });
    if (other) expect((await translateNoteForStaff(other.id, "x")).noteTr).toBe("y");
  });

  it("none provider and empty notes never reach a provider", async () => {
    expect(await translateNoteForStaff(hid, "hello")).toEqual({ noteTr: null, srcLang: null });
    const { provider, translate } = fake({});
    setTranslationProviderForTests(provider);
    expect(await translateNoteForStaff(hid, "   ")).toEqual({ noteTr: null, srcLang: null });
    expect(translate).not.toHaveBeenCalled();
  });

  it("swallows provider errors", async () => {
    setTranslationProviderForTests({
      name: "fake",
      translate: async () => {
        throw new Error("boom");
      },
    });
    expect(await translateNoteForStaff(hid, "hello")).toEqual({ noteTr: null, srcLang: null });
  });

  it("aborts a hanging provider at the timeout", async () => {
    let signal: AbortSignal | undefined;
    setTranslationProviderForTests({
      name: "fake",
      translate: (_t, o) => {
        signal = o.signal;
        return new Promise(() => {});
      },
    });
    const started = Date.now();
    expect(await translateNoteForStaff(hid, "hello", { timeoutMs: 50 })).toEqual({ noteTr: null, srcLang: null });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(signal?.aborted).toBe(true);
  });

  it("already-Turkish notes get no translation", async () => {
    const { provider } = fake({ "ekstra havlu": { text: "ekstra havlu", sourceLang: "tr", translated: false } });
    setTranslationProviderForTests(provider);
    expect(await translateNoteForStaff(hid, "ekstra havlu")).toEqual({ noteTr: null, srcLang: "tr" });
  });
});

describe("localizeTexts / warmTranslations", () => {
  it("falls back to Turkish on a miss, then serves the cache without calling the provider", async () => {
    const { provider, translate } = fake({ Su: { text: "ماء", sourceLang: "tr", translated: true } });
    setTranslationProviderForTests(provider);
    expect((await localizeTexts(["Su"], "ar")).get("Su")).toBe("Su");
    await vi.waitFor(async () => expect(await testDb.textTranslation.count()).toBe(1));
    translate.mockClear();
    expect((await localizeTexts(["Su"], "ar")).get("Su")).toBe("ماء");
    expect(translate).not.toHaveBeenCalled();
  });

  it("tr and none skip the database entirely", async () => {
    const spy = vi.spyOn(testDb.textTranslation, "findMany");
    await localizeTexts(["Su"], "ar"); // none provider
    const { provider } = fake({});
    setTranslationProviderForTests(provider);
    await localizeTexts(["Su"], "tr");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("stores one row per language and skips texts over 600 characters", async () => {
    setTranslationProviderForTests(fake({ Su: { text: "Water", sourceLang: "tr", translated: true } }).provider);
    expect(await warmTranslations(["Su", "x".repeat(601)], "en")).toBe(1);
    setTranslationProviderForTests(fake({ Su: { text: "Wasser", sourceLang: "tr", translated: true } }).provider);
    expect(await warmTranslations(["Su"], "de")).toBe(1);
    expect(await testDb.textTranslation.count()).toBe(2);
  });
});
