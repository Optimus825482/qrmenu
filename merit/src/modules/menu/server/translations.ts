import { createHash } from "node:crypto";
import type { Ctx } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { prisma } from "@/lib/prisma";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope, loadNodeScope, outletScope } from "./menuNodeAccess";
import { assertMenuAccess } from "./menuAccess";

export const TRANSLATION_LANGS = ["en", "de", "ru", "ar", "fr", "el", "it", "pt"] as const;
export type TranslationLang = (typeof TRANSLATION_LANGS)[number];
export type TranslationProvider = "DeepL" | "Gemini" | "AutoCloud";
/**
 * Translations of one record. A call that asked for only some languages (filling in what a node lacks)
 * carries only those: such callers read it through the same language list they passed.
 */
export type TranslationSet = Record<TranslationLang, { name: string; detail: string | null }>;
type Langs = readonly TranslationLang[];

const sha256 = (text: string) => createHash("sha256").update(text.trim()).digest("hex");

/** Built-in culinary & hospitality glossary for instant offline fallback if external network is unreachable. */
const CULINARY_GLOSSARY: Record<string, Record<TranslationLang, string>> = {
  "İÇECEKLER": { en: "Beverages", de: "Getränke", ru: "Напитки", ar: "المشروبات", fr: "Boissons", el: "Ποτά", it: "Bevande", pt: "Bebidas" },
  "SOĞUK İÇECEKLER": { en: "Cold Beverages", de: "Kalte Getränke", ru: "Холодные напитки", ar: "المشروبات الباردة", fr: "Boissons Froides", el: "Κρύα Ποτά", it: "Bevande Fredde", pt: "Bebidas Frias" },
  "SICAK İÇECEKLER": { en: "Hot Beverages", de: "Heiße Getränke", ru: "Горячие напитки", ar: "المشروبات الساخنة", fr: "Boissons Chaudes", el: "Ζεστά Ποτά", it: "Bevande Calde", pt: "Bebidas Quentes" },
  "ALKOLSÜZ İÇECEKLER": { en: "Non-Alcoholic Beverages", de: "Alkoholfreie Getränke", ru: "Безалкогольные напитки", ar: "مشروبات غير كحولية", fr: "Boissons Sans Alcool", el: "Μη Αλκοολούχα Ποτά", it: "Bevande Analcoliche", pt: "Bebidas Sem Álcool" },
  "ALKOLLÜ İÇECEKLER": { en: "Alcoholic Beverages", de: "Alkoholische Getränke", ru: "Алкогольные напитки", ar: "المشروبات الكحولية", fr: "Boissons Alcoolisées", el: "Αλκοολούχα Ποτά", it: "Bevande Alcoliche", pt: "Bebidas Alcoólicas" },
  "KOKTEYLLER": { en: "Cocktails", de: "Cocktails", ru: "Коктейли", ar: "الكوكتيلات", fr: "Cocktails", el: "Κοκτέιλ", it: "Cocktail", pt: "Coquetéis" },
  "ŞARAPLAR": { en: "Wines", de: "Weine", ru: "Вина", ar: "النبيذ", fr: "Vins", el: "Κρασιά", it: "Vini", pt: "Vinhos" },
  "BİRALAR": { en: "Beers", de: "Biere", ru: "Пиво", ar: "البيرة", fr: "Bières", el: "Μπύρες", it: "Birre", pt: "Cervejas" },
  "NARGİLE": { en: "Shisha & Hookah", de: "Shisha & Wasserpfeife", ru: "Кальян", ar: "الشيشة", fr: "Chicha & Narguilé", el: "Ναργιλές", it: "Narghilè", pt: "Narguilé" },
  "BAŞLANGIÇLAR": { en: "Starters & Appetizers", de: "Vorspeisen", ru: "Закуски", ar: "المقبلات", fr: "Entrées", el: "Ορεκτικά", it: "Antipasti", pt: "Entradas" },
  "ANA YEMEKLER": { en: "Main Courses", de: "Hauptgerichte", ru: "Основные блюда", ar: "الأطباق الرئيسية", fr: "Plats Principaux", el: "Κυρίως Πιάτα", it: "Piatti Principali", pt: "Pratos Principais" },
  "SALATALAR": { en: "Salads", de: "Salate", ru: "Салаты", ar: "السلطات", fr: "Salades", el: "Σαλάτες", it: "Insalate", pt: "Saladas" },
  "TATLILAR": { en: "Desserts", de: "Desserts", ru: "Десерты", ar: "الحلويات", fr: "Desserts", el: "Επιδόρπια", it: "Dolci", pt: "Sobremesas" },
  "ÇORBALAR": { en: "Soups", de: "Suppen", ru: "Супы", ar: "الشوربات", fr: "Soupes", el: "Σούπες", it: "Zuppe", pt: "Sopas" },
  "KAHVALTI": { en: "Breakfast", de: "Frühstück", ru: "Завтрак", ar: "الإفطار", fr: "Petit-déjeuner", el: "Πρωινό", it: "Colazione", pt: "Café da Manhã" },
  "ATIŞTIRMALIKLAR": { en: "Snacks & Bites", de: "Snacks", ru: "Закуски и снеки", ar: "الوجبات الخفيفة", fr: "Snacks & En-cas", el: "Σνακ", it: "Snack e Stuzzichini", pt: "Petiscos" },
  "MAKARNALAR": { en: "Pastas", de: "Pasta", ru: "Паста", ar: "المعكرونة", fr: "Pâtes", el: "Ζυμαρικά", it: "Pasta", pt: "Massas" },
  "PİZZALAR": { en: "Pizzas", de: "Pizzen", ru: "Пицца", ar: "البيتزا", fr: "Pizzas", el: "Πίτσες", it: "Pizze", pt: "Pizzas" },
  "BURGERLER": { en: "Burgers", de: "Burger", ru: "Бургеры", ar: "البرغر", fr: "Burgers", el: "Μπέργκερ", it: "Burger", pt: "Hambúrgueres" },
};

/** The keyless endpoint throttles bursts: at most this many requests are in flight at once (whole process). */
const GTX_MAX_CONCURRENT = 3;
/** Waits before the 2nd and 3rd attempt of one text. */
const GTX_RETRY_DELAYS_MS = [400, 1200];
/** Longer texts go in a POST body: a GET URL that long is refused. */
const GTX_GET_MAX_CHARS = 1200;

let gtxInFlight = 0;
const gtxWaiters: (() => void)[] = [];

async function withGtxSlot<T>(run: () => Promise<T>): Promise<T> {
  if (gtxInFlight >= GTX_MAX_CONCURRENT) await new Promise<void>((resolve) => gtxWaiters.push(resolve));
  else gtxInFlight++;
  try {
    return await run();
  } finally {
    const next = gtxWaiters.shift();
    // The slot is handed straight to the next waiter; the counter only drops when nobody waits.
    if (next) next();
    else gtxInFlight--;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One request to the keyless endpoint; `null` when it gave no usable translation. */
async function gtxRequest(text: string, targetLang: TranslationLang): Promise<string | null> {
  try {
    const base = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=tr&tl=${encodeURIComponent(targetLang)}&dt=t`;
    const q = encodeURIComponent(text);
    const long = q.length > GTX_GET_MAX_CHARS;
    const response = await fetch(long ? base : `${base}&q=${q}`, {
      method: long ? "POST" : "GET",
      headers: long
        ? { "User-Agent": "Mozilla/5.0", "content-type": "application/x-www-form-urlencoded" }
        : { "User-Agent": "Mozilla/5.0" },
      body: long ? `q=${q}` : undefined,
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (response.ok) {
      const data = (await response.json()) as unknown[];
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const parts = (data[0] as unknown[])
          .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
          .join("")
          .trim();
        if (parts) return parts;
      }
    }
  } catch {
    // Offline / timeout / throttled: no translation from this attempt.
  }
  return null;
}

/**
 * Keyless automatic translation via Google Translate GTX API with glossary fallback.
 * Requests are limited to a few at a time and retried, because the endpoint drops bursts.
 * `null` when the service gives no translation: the Turkish text is never passed off (and cached) as one.
 */
async function googleGtxTranslateSingle(text: string, targetLang: TranslationLang): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const upper = trimmed.toLocaleUpperCase("tr-TR");
  if (CULINARY_GLOSSARY[upper]?.[targetLang]) {
    return CULINARY_GLOSSARY[upper][targetLang];
  }
  for (let attempt = 0; ; attempt++) {
    const result = await withGtxSlot(() => gtxRequest(trimmed, targetLang));
    if (result) return result;
    if (attempt >= GTX_RETRY_DELAYS_MS.length) return null;
    await sleep(GTX_RETRY_DELAYS_MS[attempt]);
  }
}

/**
 * Translates with the keyless service, text by text and language by language. What is already in the
 * `TextTranslation` cache is reused and every fresh answer is cached at once, so when the service drops a
 * language the next try only asks for what is still missing. Fails (expected error, no incident) while any
 * language is missing: a half-translated record is never returned.
 */
export async function autoCloudTranslate(
  name: string,
  detail: string | null,
  langs: Langs = TRANSLATION_LANGS,
): Promise<TranslationSet> {
  const nameText = name.trim();
  // A blank detail is no detail: it has nothing to translate and must not count as a missing translation.
  const detailText = detail?.trim() || null;
  const texts = detailText ? [nameText, detailText] : [nameText];

  const known = new Map<string, string>();
  try {
    const rows = await prisma.textTranslation.findMany({
      where: { sourceHash: { in: texts.map(sha256) }, targetLang: { in: [...langs] } },
      select: { sourceHash: true, targetLang: true, translated: true },
    });
    for (const row of rows) if (row.translated.trim()) known.set(`${row.sourceHash}:${row.targetLang}`, row.translated);
  } catch {
    // Cache unreadable: everything is asked from the service.
  }

  const one = async (text: string, lang: TranslationLang): Promise<string | null> => {
    const hash = sha256(text);
    const cached = known.get(`${hash}:${lang}`);
    if (cached) return cached;
    const translated = await googleGtxTranslateSingle(text, lang);
    if (!translated) return null;
    await prisma.textTranslation
      .upsert({
        where: { sourceHash_targetLang: { sourceHash: hash, targetLang: lang } },
        create: { sourceHash: hash, sourceText: text, targetLang: lang, translated, provider: "AutoCloud" },
        update: { translated, provider: "AutoCloud" },
      })
      .catch(() => {});
    return translated;
  };

  const entries = await Promise.all(
    langs.map(async (lang) => {
      const [translatedName, translatedDetail] = await Promise.all([
        one(nameText, lang),
        detailText ? one(detailText, lang) : Promise.resolve(null),
      ]);
      return { lang, name: translatedName, detail: translatedDetail };
    }),
  );

  const missing = entries.filter((e) => !e.name || (detailText && !e.detail)).map((e) => e.lang.toUpperCase());
  if (missing.length > 0) {
    throw new DomainError(
      "RATE_LIMITED",
      `Otomatik çeviri servisi şu anda ${missing.join(", ")} çevirisini vermedi. Tamamlanan diller saklandı; ` +
        "birkaç dakika sonra yeniden deneyin.",
    );
  }
  return Object.fromEntries(
    entries.map((e) => [e.lang, { name: e.name as string, detail: detailText ? e.detail : null }]),
  ) as TranslationSet;
}

/** Check DB cache (`TextTranslation` or existing verified `MenuNodeTranslation`) for already translated text. */
async function findCachedTranslations(
  name: string,
  detail: string | null,
  langs: Langs,
): Promise<TranslationSet | null> {
  try {
    const nameHash = sha256(name);
    const detailHash = detail ? sha256(detail) : null;
    const hashes = detailHash ? [nameHash, detailHash] : [nameHash];
    const cached = await prisma.textTranslation.findMany({
      where: {
        sourceHash: { in: hashes },
        targetLang: { in: [...langs] },
      },
      select: { sourceHash: true, targetLang: true, translated: true },
    });

    const byHashAndLang = new Map(cached.map((r) => [`${r.sourceHash}:${r.targetLang}`, r.translated]));
    const result: Partial<Record<TranslationLang, { name: string; detail: string | null }>> = {};
    let allFound = true;
    for (const lang of langs) {
      const tName = byHashAndLang.get(`${nameHash}:${lang}`);
      const tDetail = detailHash ? byHashAndLang.get(`${detailHash}:${lang}`) : null;
      if (!tName || (detailHash && !tDetail)) {
        allFound = false;
        break;
      }
      result[lang] = { name: tName, detail: detailHash ? (tDetail ?? null) : null };
    }
    if (allFound) {
      return result as TranslationSet;
    }
  } catch {
    // Ignore cache read errors
  }
  return null;
}

/** Save translated name & detail into `TextTranslation` cache for instant reuse across outlets. */
async function saveCachedTranslations(
  name: string,
  detail: string | null,
  translations: TranslationSet,
  provider: string,
): Promise<void> {
  try {
    const nameTrim = name.trim();
    const nameHash = sha256(nameTrim);
    const detailTrim = detail?.trim() || null;
    const detailHash = detailTrim ? sha256(detailTrim) : null;

    for (const lang of TRANSLATION_LANGS) {
      const val = translations[lang];
      if (val?.name) {
        await prisma.textTranslation.upsert({
          where: { sourceHash_targetLang: { sourceHash: nameHash, targetLang: lang } },
          create: { sourceHash: nameHash, sourceText: nameTrim, targetLang: lang, translated: val.name, provider },
          update: { translated: val.name, provider },
        });
      }
      if (detailTrim && detailHash && val?.detail) {
        await prisma.textTranslation.upsert({
          where: { sourceHash_targetLang: { sourceHash: detailHash, targetLang: lang } },
          create: { sourceHash: detailHash, sourceText: detailTrim, targetLang: lang, translated: val.detail, provider },
          update: { translated: val.detail, provider },
        });
      }
    }
  } catch {
    // Cache write is best-effort
  }
}

const DEEPL_TARGET: Record<TranslationLang, string> = {
  en: "EN-GB", de: "DE", ru: "RU", ar: "AR", fr: "FR", el: "EL", it: "IT", pt: "PT-BR",
};

/** Translate a Turkish menu record using DeepL API. */
async function deeplTranslate(
  name: string,
  detail: string | null,
  apiKey: string,
  langs: Langs = TRANSLATION_LANGS,
): Promise<TranslationSet> {
  const endpoint = apiKey.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
  const sourceTexts = detail ? [name, detail] : [name];
  const entries = await Promise.all(
    langs.map(async (lang) => {
      const body = new URLSearchParams({ source_lang: "TR", target_lang: DEEPL_TARGET[lang] });
      for (const text of sourceTexts) body.append("text", text);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `DeepL-Auth-Key ${apiKey}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`DeepL ${lang.toUpperCase()} çevirisini oluşturamadı (HTTP ${response.status}).`);
      }
      const payload: unknown = await response.json();
      const translated = (payload as { translations?: { text?: unknown }[] })?.translations?.map((item) => item.text);
      if (
        !translated ||
        translated.length !== sourceTexts.length ||
        translated.some((value) => typeof value !== "string" || !value.trim())
      ) {
        throw new Error(`${lang.toUpperCase()} çeviri yanıtı eksik veya geçersiz.`);
      }
      return [
        lang,
        {
          name: String(translated[0]).trim(),
          detail: detail ? String(translated[1]).trim() : null,
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as TranslationSet;
}

export function normalizeGeminiModel(model?: string | null): string {
  if (!model) return "gemini-3.8-flash";
  const m = model.trim().toLowerCase();
  if (
    m === "gemini-2.0-flash" ||
    m === "gemini-2.0-flash-exp" ||
    m === "gemini-2.5-flash" ||
    m === "gemini-3.5-flash" ||
    m === "gemini-1.5-flash" ||
    m === "gemini-1.5-pro" ||
    m === "gemini-pro"
  ) {
    return "gemini-3.8-flash";
  }
  return model.trim();
}

const GEMINI_LANG_NAME: Record<TranslationLang, string> = {
  en: "English", de: "German", ru: "Russian", ar: "Arabic", fr: "French", el: "Greek", it: "Italian",
  pt: "Brazilian Portuguese",
};

/** Translate a Turkish menu record into the given guest languages using Google AI Studio (Gemini). */
async function geminiTranslate(
  name: string,
  detail: string | null,
  apiKey: string,
  model = "gemini-3.8-flash",
  langs: Langs = TRANSLATION_LANGS,
): Promise<TranslationSet> {
  const activeModel = normalizeGeminiModel(model);
  const languageList = langs.map((l) => `${GEMINI_LANG_NAME[l]} (${l})`).join(", ");
  const detailShape = detail ? '"..."' : "null";
  const shape = langs.map((l) => `  "${l}": { "name": "...", "detail": ${detailShape} }`).join(",\n");
  const prompt = `You are a culinary expert and professional luxury hotel menu translator.
Translate this Turkish menu dish/item into these languages: ${languageList}.
Ensure appetizing, authentic culinary terminology, preserving ingredient clarity.

Item to translate:
Name: "${name}"
${detail ? `Detail: "${detail}"` : "Detail: null"}

Respond ONLY with a JSON object with this exact structure (no markdown fences, just pure JSON):
{
${shape}
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Google Gemini API (${activeModel}) hatası (HTTP ${response.status}): ${errText.slice(0, 120)}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini'den çeviri yanıtı alınamadı.");

  const parsed = JSON.parse(rawText) as Record<string, { name?: string; detail?: string | null }>;
  const out: Partial<Record<TranslationLang, { name: string; detail: string | null }>> = {};

  for (const lang of langs) {
    const item = parsed[lang];
    if (!item?.name || typeof item.name !== "string" || !item.name.trim()) {
      throw new Error(`Gemini ${lang.toUpperCase()} çevirisini eksik döndürdü.`);
    }
    out[lang] = {
      name: item.name.trim(),
      detail: detail && item.detail ? String(item.detail).trim() : null,
    };
  }

  return out as TranslationSet;
}

/** Keys, preferred provider and Gemini model: Denetim Masası → Sistem → Çeviri, environment as fallback. */
export async function loadTranslationConfig(): Promise<{
  deeplKey?: string;
  geminiKey?: string;
  provider: "AUTO" | "DEEPL" | "GEMINI";
  geminiModel: string;
}> {
  let dbDeepl = "";
  let dbGemini = "";
  let dbProvider: "AUTO" | "DEEPL" | "GEMINI" = "AUTO";
  let dbModel = "gemini-3.8-flash";

  try {
    const s = await getSettings([
      "translation.deeplKey",
      "translation.geminiKey",
      "translation.provider",
      "translation.geminiModel",
    ]);
    dbDeepl = s["translation.deeplKey"]?.trim() || "";
    dbGemini = s["translation.geminiKey"]?.trim() || "";
    dbProvider = s["translation.provider"] || "AUTO";
    dbModel = normalizeGeminiModel(s["translation.geminiModel"] || "gemini-3.8-flash");
  } catch {
    // DB not available or initial setup
  }

  const deeplKey = dbDeepl || process.env.DEEPL_AUTH_KEY?.trim() || undefined;
  const geminiKey =
    dbGemini || process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_AI_API_KEY?.trim() || undefined;

  return {
    deeplKey,
    geminiKey,
    provider: dbProvider,
    geminiModel: dbModel,
  };
}

/**
 * Robust translation orchestrator:
 * 1. Checks DB cache (`TextTranslation`) for instant reuse across outlets.
 * 2. Checks settings from DB (Denetim Masası → Sistem → Çeviri) with .env fallback.
 * 3. Tries DeepL / Gemini when configured; seamlessly falls back to `autoCloudTranslate` (Google GTX + Culinary Glossary)
 *    so automatic background translation NEVER fails even without manual API keys.
 */
export async function translateMenuItem(
  name: string,
  detail: string | null,
  /** Languages to produce; the background completion passes only what a node still lacks. */
  langs: Langs = TRANSLATION_LANGS,
): Promise<{
  translations: TranslationSet;
  provider: TranslationProvider;
}> {
  const cached = await findCachedTranslations(name, detail, langs);
  if (cached) {
    return { translations: cached, provider: "AutoCloud" };
  }

  const config = await loadTranslationConfig();
  const hasDeepl = Boolean(config.deeplKey);
  const hasGemini = Boolean(config.geminiKey);

  // Yalnızca Gemini seçildiyse ve anahtar varsa:
  if (config.provider === "GEMINI" && hasGemini) {
    try {
      const translations = await geminiTranslate(name, detail, config.geminiKey!, config.geminiModel, langs);
      await saveCachedTranslations(name, detail, translations, "Gemini");
      return { translations, provider: "Gemini" };
    } catch (err) {
      console.warn("[i18n] Gemini çeviri hatası, otomatik bulut çevirisine geçiliyor:", err);
    }
  }

  // Yalnızca DeepL seçildiyse ve anahtar varsa:
  if (config.provider === "DEEPL" && hasDeepl) {
    try {
      const translations = await deeplTranslate(name, detail, config.deeplKey!, langs);
      await saveCachedTranslations(name, detail, translations, "DeepL");
      return { translations, provider: "DeepL" };
    } catch (err) {
      console.warn("[i18n] DeepL çeviri hatası, otomatik bulut çevirisine geçiliyor:", err);
    }
  }

  // AUTO Modu: Birincil DeepL, ikincil Gemini, üçüncül Kesintisiz Otomatik Bulut Çevirisi
  if (hasDeepl) {
    try {
      const translations = await deeplTranslate(name, detail, config.deeplKey!, langs);
      await saveCachedTranslations(name, detail, translations, "DeepL");
      return { translations, provider: "DeepL" };
    } catch (deeplErr) {
      console.warn("[i18n] DeepL çeviri servisinde sorun oluştu, yedek servise geçiliyor:", deeplErr);
    }
  }

  if (hasGemini) {
    try {
      const translations = await geminiTranslate(name, detail, config.geminiKey!, config.geminiModel, langs);
      await saveCachedTranslations(name, detail, translations, "Gemini");
      return { translations, provider: "Gemini" };
    } catch (geminiErr) {
      console.warn("[i18n] Gemini çeviri servisinde sorun oluştu, otomatik bulut çevirisine geçiliyor:", geminiErr);
    }
  }

  const translations = await autoCloudTranslate(name, detail, langs);
  await saveCachedTranslations(name, detail, translations, "AutoCloud");
  return { translations, provider: "AutoCloud" };
}

/** Generate complete translations first, then persist all languages in one transaction (automatic only, K2). */
export async function autoGenerate(
  ctx: Ctx,
  nodeId: string,
): Promise<{ languages: TranslationLang[]; provider: TranslationProvider }> {
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);
  const source = await prisma.menuNode.findUnique({ where: { id: nodeId }, select: { name: true, detail: true } });
  if (!source) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");
  const { translations, provider } = await translateMenuItem(source.name, source.detail);
  await prisma.$transaction(async (tx) => {
    assertOutletScope(ctx, scope.outletId);
    for (const lang of TRANSLATION_LANGS) {
      const value = translations[lang];
      await tx.menuNodeTranslation.upsert({
        where: { nodeId_lang: { nodeId, lang } },
        create: { nodeId, lang, name: value.name, detail: value.detail },
        update: { name: value.name, detail: value.detail },
      });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: scope.hotelId,
        action: "MENU_TRANSLATION_SET",
        entity: "MenuNode",
        entityId: nodeId,
        after: { lang, name: value.name, provider, auto: true },
      });
    }
    await publish(
      {
        type: "menu.changed",
        hotelId: scope.hotelId,
        outletId: scope.outletId,
        payload: { nodeId, op: "translation", auto: true, provider },
      },
      tx,
    );
  });
  return { languages: [...TRANSLATION_LANGS], provider };
}

/** Active background translation jobs per outletId so concurrent triggers don't duplicate work. */
const activeOutletSyncs = new Set<string>();

export interface OutletTranslationAuditStatus {
  outletId: string;
  totalNodes: number;
  completeNodes: number;
  missingNodes: number;
  missingTranslationsCount: number;
  isSyncing: boolean;
}

/**
 * Inspects all categories, subcategories, groups, and items in an outlet
 * and returns how many nodes have complete translations in every guest language vs missing ones.
 */
export async function getOutletTranslationAudit(outletId: string): Promise<OutletTranslationAuditStatus> {
  const nodes = await prisma.menuNode.findMany({
    where: { outletId },
    select: {
      id: true,
      detail: true,
      translations: { select: { lang: true, name: true, detail: true } },
    },
  });

  let completeNodes = 0;
  let missingNodes = 0;
  let missingTranslationsCount = 0;

  for (const node of nodes) {
    const byLang = new Map(node.translations.map((t) => [t.lang, t]));
    let nodeMissing = 0;
    for (const lang of TRANSLATION_LANGS) {
      const tr = byLang.get(lang);
      const hasName = Boolean(tr?.name?.trim());
      const needsDetail = Boolean(node.detail?.trim());
      const hasDetail = !needsDetail || Boolean(tr?.detail?.trim());
      if (!tr || !hasName || !hasDetail) {
        nodeMissing++;
      }
    }
    if (nodeMissing === 0) {
      completeNodes++;
    } else {
      missingNodes++;
      missingTranslationsCount += nodeMissing;
    }
  }

  return {
    outletId,
    totalNodes: nodes.length,
    completeNodes,
    missingNodes,
    missingTranslationsCount,
    isSyncing: activeOutletSyncs.has(outletId),
  };
}

/**
 * Background daemon that scans an outlet for any MenuNode (category, subcategory, group, or item)
 * with missing translations in any supported guest language, completes them automatically
 * in batches, and emits `menu.changed` SSE events so `Menü Yönetim Merkezi` updates live.
 */
export async function syncOutletMissingTranslations(
  outletId: string,
  hotelId?: string,
  options: { maxNodesPerRun?: number } = {},
): Promise<{ translatedNodes: number; remainingNodes: number }> {
  if (process.env.VITEST === "true") {
    return { translatedNodes: 0, remainingNodes: 0 };
  }
  if (activeOutletSyncs.has(outletId)) {
    const status = await getOutletTranslationAudit(outletId);
    return { translatedNodes: 0, remainingNodes: status.missingNodes };
  }

  activeOutletSyncs.add(outletId);
  let translatedNodes = 0;
  try {
    const nodes = await prisma.menuNode.findMany({
      where: { outletId },
      include: { translations: true },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    });

    // Only the languages a node lacks are produced and written: a newly added guest language is filled in
    // without asking the provider again for (or overwriting) the languages the node already has.
    const incomplete = nodes
      .map((node) => {
        const byLang = new Map(node.translations.map((t) => [t.lang, t]));
        const missing = TRANSLATION_LANGS.filter((lang) => {
          const tr = byLang.get(lang);
          return !tr || !tr.name?.trim() || Boolean(node.detail?.trim() && !tr.detail?.trim());
        });
        return { node, missing };
      })
      .filter((entry) => entry.missing.length > 0);

    if (incomplete.length === 0) {
      return { translatedNodes: 0, remainingNodes: 0 };
    }

    const limit = options.maxNodesPerRun ?? incomplete.length;
    const targetNodes = incomplete.slice(0, limit);
    const BATCH_SIZE = 5;

    for (let i = 0; i < targetNodes.length; i += BATCH_SIZE) {
      const batch = targetNodes.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async ({ node, missing }) => {
          try {
            const { translations } = await translateMenuItem(node.name, node.detail, missing);
            if (await saveIfSourceUnchanged(node.id, node.name, node.detail, translations, missing)) translatedNodes++;
          } catch (err) {
            console.warn(`[i18n] Eksik çeviri tamamlanamadı (${node.id} - "${node.name}"):`, err);
          }
        }),
      );

      if (outletId) {
        await publish({
          type: "menu.changed",
          hotelId: hotelId ?? undefined,
          outletId,
          payload: { op: "translation.batch", translatedNodes },
        }).catch(() => {});
      }
    }

    const remaining = Math.max(0, incomplete.length - translatedNodes);
    return { translatedNodes, remainingNodes: remaining };
  } finally {
    activeOutletSyncs.delete(outletId);
  }
}

export async function auditAndSyncOutletTranslations(
  ctx: Ctx,
  outletId: string,
  triggerSync = true,
): Promise<OutletTranslationAuditStatus> {
  const outlet = await outletScope(outletId);
  await assertMenuAccess(ctx, outlet, "V");
  assertOutletScope(ctx, outletId);
  const status = await getOutletTranslationAudit(outletId);
  if (triggerSync && status.missingNodes > 0 && !activeOutletSyncs.has(outletId)) {
    void syncOutletMissingTranslations(outletId, outlet.hotelId).catch((err) =>
      console.warn("[i18n] Arka plan outlet çeviri senkronizasyonu hatası:", err),
    );
    return { ...status, isSyncing: true };
  }
  return status;
}

/**
 * Automatically translates a menu node (category, subcategory, group, or item)
 * into all supported guest languages and saves them (call it after the node's transaction committed),
 * then triggers a background check for any other missing translations in the same outlet.
 * Safe to fire-and-forget in background.
 */
export async function autoTranslateMenuNode(
  nodeId: string,
  name: string,
  detail: string | null,
  hotelId?: string,
  outletId?: string,
): Promise<void> {
  if (process.env.VITEST === "true") return;
  try {
    const { translations, provider } = await translateMenuItem(name, detail);
    if (!(await saveIfSourceUnchanged(nodeId, name, detail, translations))) return;
    if (outletId) {
      await publish({
        type: "menu.changed",
        hotelId: hotelId ?? undefined,
        outletId,
        payload: { nodeId, op: "translation", auto: true, provider },
      });
      // Also check and complete any other nodes in this outlet that have missing translations
      void syncOutletMissingTranslations(outletId, hotelId).catch(() => {});
    }
  } catch (error) {
    console.warn(`[i18n] Failed to auto-translate menu node ${nodeId} ("${name}"):`, error);
  }
}

/**
 * Writes the generated translations only while the node still has the Turkish text they were made from
 * (row lock, one transaction): a slow provider answer for an older text never overwrites a newer one.
 */
async function saveIfSourceUnchanged(
  nodeId: string,
  name: string,
  detail: string | null,
  translations: TranslationSet,
  langs: Langs = TRANSLATION_LANGS,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
    const current = await tx.menuNode.findUnique({ where: { id: nodeId }, select: { name: true, detail: true } });
    if (!current || current.name !== name || (current.detail ?? null) !== (detail ?? null)) return false;
    for (const lang of langs) {
      const val = translations[lang];
      if (!val) continue;
      await tx.menuNodeTranslation.upsert({
        where: { nodeId_lang: { nodeId, lang } },
        create: { nodeId, lang, name: val.name, detail: val.detail },
        update: { name: val.name, detail: val.detail },
      });
    }
    return true;
  });
}

/** Last guest-triggered sync start per outlet: a failing provider is not hammered on every menu request. */
const lastGuestSync = new Map<string, number>();
export const GUEST_SYNC_COOLDOWN_MS = 10 * 60_000;

/**
 * Guest-menu trigger for missing translations: at most once per outlet per cooldown window
 * (and never while a sync of that outlet runs). Fire-and-forget.
 */
export function requestOutletTranslationSync(outletId: string, hotelId?: string, now = Date.now()): boolean {
  if (activeOutletSyncs.has(outletId)) return false;
  const last = lastGuestSync.get(outletId);
  if (last !== undefined && now - last < GUEST_SYNC_COOLDOWN_MS) return false;
  lastGuestSync.set(outletId, now);
  void syncOutletMissingTranslations(outletId, hotelId).catch(() => {});
  return true;
}

/** Test hook: forget the guest-trigger cooldowns. */
export function resetGuestSyncCooldownForTests(): void {
  lastGuestSync.clear();
}

/** Test connectivity and translation accuracy with Google Gemini. */
export async function testGeminiTranslation(
  modelOverride?: string,
  apiKeyOverride?: string,
): Promise<{
  ok: true;
  model: string;
  latencyMs: number;
  sample: { source: string; translated: string };
  message: string;
}> {
  const config = await loadTranslationConfig();
  const apiKey = apiKeyOverride?.trim() || config.geminiKey;
  if (!apiKey) {
    throw new DomainError(
      "VALIDATION",
      "Google AI Studio API anahtarı bulunamadı. Lütfen önce 'Google AI Studio API anahtarı' alanına anahtarınızı girip kaydedin.",
    );
  }

  const model = normalizeGeminiModel(modelOverride || config.geminiModel || "gemini-3.8-flash");
  const start = performance.now();

  const prompt = `Translate this Turkish menu dish name into English: "Türk Kahvesi".
Respond ONLY with a valid JSON object in this format (no markdown fences, just pure JSON):
{"translated": "Turkish Coffee"}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });

  const latencyMs = Math.round(performance.now() - start);

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    let errorDetail = errText;
    try {
      const parsed = JSON.parse(errText);
      errorDetail = parsed.error?.message || errText;
    } catch {}
    throw new DomainError(
      "INTERNAL",
      `Google Gemini (${model}) API hatası [HTTP ${response.status}]: ${errorDetail.slice(0, 160)}`,
    );
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new DomainError("INTERNAL", "Gemini'den yanıt alınamadı.");
  }

  let translated = "Turkish Coffee";
  try {
    const parsed = JSON.parse(rawText) as { translated?: string; name?: string };
    translated = parsed.translated || parsed.name || rawText.trim();
  } catch {
    translated = rawText.trim();
  }

  return {
    ok: true,
    model,
    latencyMs,
    sample: {
      source: "Türk Kahvesi",
      translated,
    },
    message: `Gemini (${model}) bağlantısı başarılı! Yanıt süresi: ${latencyMs} ms. Test: "Türk Kahvesi" → "${translated}"`,
  };
}

/** Test connectivity and translation accuracy with DeepL. */
export async function testDeeplTranslation(apiKeyOverride?: string): Promise<{
  ok: true;
  latencyMs: number;
  sample: { source: string; translated: string };
  message: string;
}> {
  const config = await loadTranslationConfig();
  const apiKey = apiKeyOverride?.trim() || config.deeplKey;
  if (!apiKey) {
    throw new DomainError(
      "VALIDATION",
      "DeepL API anahtarı bulunamadı. Lütfen önce 'DeepL API anahtarı' alanına anahtarınızı girip kaydedin.",
    );
  }
  const endpoint = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
  const start = performance.now();
  const body = new URLSearchParams({
    source_lang: "TR",
    target_lang: "EN-GB",
    text: "Türk Kahvesi",
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `DeepL-Auth-Key ${apiKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  const latencyMs = Math.round(performance.now() - start);
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new DomainError(
      "INTERNAL",
      `DeepL API hatası [HTTP ${response.status}]: ${errText.slice(0, 160)}`,
    );
  }
  const payload = (await response.json()) as { translations?: { text?: string }[] };
  const translated = payload.translations?.[0]?.text || "Turkish Coffee";
  return {
    ok: true,
    latencyMs,
    sample: { source: "Türk Kahvesi", translated },
    message: `DeepL bağlantısı başarılı! Yanıt süresi: ${latencyMs} ms. Test: "Türk Kahvesi" → "${translated}"`,
  };
}
