import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { noneProvider } = await import("@/modules/mybar/server/translate/none");
const { gtxProvider } = await import("@/modules/mybar/server/translate/gtx");
const { getTranslationProvider, setTranslationProviderForTests } = await import(
  "@/modules/mybar/server/translate"
);
const { translateNoteForStaff, localizeTexts, warmTranslations, resetTranslationMemoryForTests, WARM_BATCH_MAX } = await import(
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
  resetTranslationMemoryForTests();
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

describe("hardening", () => {
  const ac = () => new AbortController().signal;

  it("gtx throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(gtxProvider.translate("x", { to: "tr", signal: ac() })).rejects.toThrow("503");
  });

  it("selects the provider from TRANSLATE_PROVIDER", async () => {
    const prev = process.env.TRANSLATE_PROVIDER;
    try {
      process.env.TRANSLATE_PROVIDER = "gtx";
      vi.resetModules();
      const mod = await import("@/modules/mybar/server/translate");
      expect(mod.getTranslationProvider().name).toBe("gtx");
      process.env.TRANSLATE_PROVIDER = "none";
      vi.resetModules();
      const mod2 = await import("@/modules/mybar/server/translate");
      expect(mod2.getTranslationProvider().name).toBe("none");
    } finally {
      if (prev === undefined) delete process.env.TRANSLATE_PROVIDER;
      else process.env.TRANSLATE_PROVIDER = prev;
      vi.resetModules();
    }
  });

  it("never logs note text, even on failure", async () => {
    const warnSpy = vi.mocked(console.warn);
    warnSpy.mockClear();
    setTranslationProviderForTests({
      name: "fake",
      translate: async () => {
        throw new Error("secret-note-content");
      },
    });
    await translateNoteForStaff(hid, "secret-note-content");
    expect(warnSpy).toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("secret-note-content");
  });

  it("times out under fake timers", async () => {
    setTranslationProviderForTests({ name: "fake", translate: () => new Promise(() => {}) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let result: unknown;
      void translateNoteForStaff(hid, "hello").then((r) => (result = r));
      for (let i = 0; i < 100 && result === undefined; i += 1) {
        await vi.advanceTimersByTimeAsync(100);
        await new Promise((r) => setImmediate(r));
      }
      expect(result).toEqual({ noteTr: null, srcLang: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("strips HTML/control chars and rejects notes over 500 characters before the provider", async () => {
    const { provider, translate } = fake({ hello: { text: "merhaba", sourceLang: "en", translated: true } });
    setTranslationProviderForTests(provider);
    expect((await translateNoteForStaff(hid, "<b>hel\u0007lo</b>")).noteTr).toBe("merhaba");
    expect(translate).toHaveBeenCalledWith("hello", expect.anything());
    translate.mockClear();
    expect(await translateNoteForStaff(hid, "a".repeat(501))).toEqual({ noteTr: null, srcLang: null });
    expect(translate).not.toHaveBeenCalled();
  });

  it("caps warm batches and skips in-flight keys", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const translate = vi.fn(async (t: string) => {
      await gate;
      return { text: `${t}-x`, sourceLang: "tr", translated: true };
    });
    setTranslationProviderForTests({ name: "fake", translate });
    const texts = Array.from({ length: WARM_BATCH_MAX + 10 }, (_, i) => `urun${i}`);
    const first = warmTranslations(texts, "en");
    const second = warmTranslations(texts, "en"); // all first-batch keys in flight
    release();
    expect(await first).toBe(WARM_BATCH_MAX);
    await second;
    expect(translate.mock.calls.length).toBeLessThanOrEqual(WARM_BATCH_MAX + 10);
    expect(new Set(translate.mock.calls.map((c) => c[0])).size).toBe(translate.mock.calls.length);
  });

  it("negative-caches unchanged texts and reports cache-write errors separately", async () => {
    const { provider, translate } = fake({});
    setTranslationProviderForTests(provider);
    expect(await warmTranslations(["Coca-Cola"], "en")).toBe(0);
    await localizeTexts(["Coca-Cola"], "en");
    await warmTranslations(["Coca-Cola"], "en");
    expect(translate).toHaveBeenCalledTimes(1);

    const ok = fake({ Su: { text: "Water", sourceLang: "tr", translated: true } });
    setTranslationProviderForTests(ok.provider);
    const warnSpy = vi.mocked(console.warn);
    warnSpy.mockClear();
    const up = vi.spyOn(testDb.textTranslation, "upsert").mockRejectedValueOnce(new Error("db down"));
    expect(await warmTranslations(["Su"], "en")).toBe(0);
    up.mockRestore();
    expect(String(warnSpy.mock.calls[0][0])).toContain("önbellek yazımı");
  });
});
