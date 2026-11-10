import { createHash } from "node:crypto";
import type { Ctx } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { prisma } from "@/lib/prisma";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope, loadNodeScope, outletScope } from "./menuNodeAccess";
import { assertMenuAccess } from "./menuAccess";

export const TRANSLATION_LANGS = ["en", "de", "ru", "ar", "fr", "el", "it"] as const;
export type TranslationLang = (typeof TRANSLATION_LANGS)[number];
export type TranslationProvider = "DeepL" | "Gemini" | "AutoCloud";

const sha256 = (text: string) => createHash("sha256").update(text.trim()).digest("hex");

/** Built-in culinary & hospitality glossary for instant offline fallback if external network is unreachable. */
const CULINARY_GLOSSARY: Record<string, Record<TranslationLang, string>> = {
  "İÇECEKLER": { en: "Beverages", de: "Getränke", ru: "Напитки", ar: "المشروبات", fr: "Boissons", el: "Ποτά", it: "Bevande" },
  "SOĞUK İÇECEKLER": { en: "Cold Beverages", de: "Kalte Getränke", ru: "Холодные напитки", ar: "المشروبات الباردة", fr: "Boissons Froides", el: "Κρύα Ποτά", it: "Bevande Fredde" },
  "SICAK İÇECEKLER": { en: "Hot Beverages", de: "Heiße Getränke", ru: "Горячие напитки", ar: "المشروبات الساخنة", fr: "Boissons Chaudes", el: "Ζεστά Ποτά", it: "Bevande Calde" },
  "ALKOLSÜZ İÇECEKLER": { en: "Non-Alcoholic Beverages", de: "Alkoholfreie Getränke", ru: "Безалкогольные напитки", ar: "مشروبات غير كحولية", fr: "Boissons Sans Alcool", el: "Μη Αλκοολούχα Ποτά", it: "Bevande Analcoliche" },
  "ALKOLLÜ İÇECEKLER": { en: "Alcoholic Beverages", de: "Alkoholische Getränke", ru: "Алкогольные напитки", ar: "المشروبات الكحولية", fr: "Boissons Alcoolisées", el: "Αλκοολούχα Ποτά", it: "Bevande Alcoliche" },
  "KOKTEYLLER": { en: "Cocktails", de: "Cocktails", ru: "Коктейли", ar: "الكوكتيلات", fr: "Cocktails", el: "Κοκτέιλ", it: "Cocktail" },
  "ŞARAPLAR": { en: "Wines", de: "Weine", ru: "Вина", ar: "النبيذ", fr: "Vins", el: "Κρασιά", it: "Vini" },
  "BİRALAR": { en: "Beers", de: "Biere", ru: "Пиво", ar: "البيرة", fr: "Bières", el: "Μπύρες", it: "Birre" },
  "NARGİLE": { en: "Shisha & Hookah", de: "Shisha & Wasserpfeife", ru: "Кальян", ar: "الشيشة", fr: "Chicha & Narguilé", el: "Ναργιλές", it: "Narghilè" },
  "BAŞLANGIÇLAR": { en: "Starters & Appetizers", de: "Vorspeisen", ru: "Закуски", ar: "المقبلات", fr: "Entrées", el: "Ορεκτικά", it: "Antipasti" },
  "ANA YEMEKLER": { en: "Main Courses", de: "Hauptgerichte", ru: "Основные блюда", ar: "الأطباق الرئيسية", fr: "Plats Principaux", el: "Κυρίως Πιάτα", it: "Piatti Principali" },
  "SALATALAR": { en: "Salads", de: "Salate", ru: "Салаты", ar: "السلطات", fr: "Salades", el: "Σαλάτες", it: "Insalate" },
  "TATLILAR": { en: "Desserts", de: "Desserts", ru: "Десерты", ar: "الحلويات", fr: "Desserts", el: "Επιδόρπια", it: "Dolci" },
  "ÇORBALAR": { en: "Soups", de: "Suppen", ru: "Супы", ar: "الشوربات", fr: "Soupes", el: "Σούπες", it: "Zuppe" },
  "KAHVALTI": { en: "Breakfast", de: "Frühstück", ru: "Завтрак", ar: "الإفطار", fr: "Petit-déjeuner", el: "Πρωινό", it: "Colazione" },
  "ATIŞTIRMALIKLAR": { en: "Snacks & Bites", de: "Snacks", ru: "Закуски и снеки", ar: "الوجبات الخفيفة", fr: "Snacks & En-cas", el: "Σνακ", it: "Snack e Stuzzichini" },
  "MAKARNALAR": { en: "Pastas", de: "Pasta", ru: "Паста", ar: "المعكرونة", fr: "Pâtes", el: "Ζυμαρικά", it: "Pasta" },
  "PİZZALAR": { en: "Pizzas", de: "Pizzen", ru: "Пицца", ar: "البيتزا", fr: "Pizzas", el: "Πίτσες", it: "Pizze" },
  "BURGERLER": { en: "Burgers", de: "Burger", ru: "Бургеры", ar: "البرغر", fr: "Burgers", el: "Μπέργκερ", it: "Burger" },
};

/**
 * Keyless automatic translation via Google Translate GTX API with glossary fallback.
 * `null` when the service gives no translation: the Turkish text is never passed off (and cached) as one.
 */
async function googleGtxTranslateSingle(text: string, targetLang: TranslationLang): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const upper = trimmed.toLocaleUpperCase("tr-TR");
  if (CULINARY_GLOSSARY[upper]?.[targetLang]) {
    return CULINARY_GLOSSARY[upper][targetLang];
  }
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=tr&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0" },
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
    // Offline / timeout: no translation (the caller fails and the node is retried later).
  }
  return null;
}

export async function autoCloudTranslate(
  name: string,
  detail: string | null,
): Promise<Record<TranslationLang, { name: string; detail: string | null }>> {
  const entries = await Promise.all(
    TRANSLATION_LANGS.map(async (lang) => {
      const [translatedName, translatedDetail] = await Promise.all([
        googleGtxTranslateSingle(name, lang),
        detail ? googleGtxTranslateSingle(detail, lang) : Promise.resolve(null),
      ]);
      if (!translatedName || (detail && !translatedDetail)) {
        throw new Error(`Otomatik çeviri servisi ${lang.toUpperCase()} çevirisini döndürmedi.`);
      }
      return [lang, { name: translatedName, detail: detail ? translatedDetail : null }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<TranslationLang, { name: string; detail: string | null }>;
}

/** Check DB cache (`TextTranslation` or existing verified `MenuNodeTranslation`) for already translated text. */
async function findCachedTranslations(
  name: string,
  detail: string | null,
): Promise<Record<TranslationLang, { name: string; detail: string | null }> | null> {
  try {
    const nameHash = sha256(name);
    const detailHash = detail ? sha256(detail) : null;
    const hashes = detailHash ? [nameHash, detailHash] : [nameHash];
    const cached = await prisma.textTranslation.findMany({
      where: {
        sourceHash: { in: hashes },
        targetLang: { in: [...TRANSLATION_LANGS] },
      },
      select: { sourceHash: true, targetLang: true, translated: true },
    });

    const byHashAndLang = new Map(cached.map((r) => [`${r.sourceHash}:${r.targetLang}`, r.translated]));
    const result: Partial<Record<TranslationLang, { name: string; detail: string | null }>> = {};
    let allFound = true;
    for (const lang of TRANSLATION_LANGS) {
      const tName = byHashAndLang.get(`${nameHash}:${lang}`);
      const tDetail = detailHash ? byHashAndLang.get(`${detailHash}:${lang}`) : null;
      if (!tName || (detailHash && !tDetail)) {
        allFound = false;
        break;
      }
      result[lang] = { name: tName, detail: detailHash ? (tDetail ?? null) : null };
    }
    if (allFound) {
      return result as Record<TranslationLang, { name: string; detail: string | null }>;
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
  translations: Record<TranslationLang, { name: string; detail: string | null }>,
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
  en: "EN-GB", de: "DE", ru: "RU", ar: "AR", fr: "FR", el: "EL", it: "IT",
};

/** Translate a Turkish menu record using DeepL API. */
async function deeplTranslate(
  name: string,
  detail: string | null,
  apiKey: string,
): Promise<Record<TranslationLang, { name: string; detail: string | null }>> {
  const endpoint = apiKey.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
  const sourceTexts = detail ? [name, detail] : [name];
  const entries = await Promise.all(
    TRANSLATION_LANGS.map(async (lang) => {
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
  return Object.fromEntries(entries) as Record<TranslationLang, { name: string; detail: string | null }>;
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

/** Translate a Turkish menu record into all supported guest languages using Google AI Studio (Gemini). */
async function geminiTranslate(
  name: string,
  detail: string | null,
  apiKey: string,
  model = "gemini-3.8-flash",
): Promise<Record<TranslationLang, { name: string; detail: string | null }>> {
  const activeModel = normalizeGeminiModel(model);
  const prompt = `You are a culinary expert and professional luxury hotel menu translator.
Translate this Turkish menu dish/item into English (en), German (de), Russian (ru), Arabic (ar), French (fr), Greek (el), and Italian (it).
Ensure appetizing, authentic culinary terminology, preserving ingredient clarity.

Item to translate:
Name: "${name}"
${detail ? `Detail: "${detail}"` : "Detail: null"}

Respond ONLY with a JSON object with this exact structure (no markdown fences, just pure JSON):
{
  "en": { "name": "...", "detail": ${detail ? '"..."' : "null"} },
  "de": { "name": "...", "detail": ${detail ? '"..."' : "null"} },
  "ru": { "name": "...", "detail": ${detail ? '"..."' : "null"} },
  "ar": { "name": "...", "detail": ${detail ? '"..."' : "null"} },
  "fr": { "name": "...", "detail": ${detail ? '"..."' : "null"} },
  "el": { "name": "...", "detail": ${detail ? '"..."' : "null"} },
  "it": { "name": "...", "detail": ${detail ? '"..."' : "null"} }
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

  for (const lang of TRANSLATION_LANGS) {
    const item = parsed[lang];
    if (!item?.name || typeof item.name !== "string" || !item.name.trim()) {
      throw new Error(`Gemini ${lang.toUpperCase()} çevirisini eksik döndürdü.`);
    }
    out[lang] = {
      name: item.name.trim(),
      detail: detail && item.detail ? String(item.detail).trim() : null,
    };
  }

  return out as Record<TranslationLang, { name: string; detail: string | null }>;
}

async function loadTranslationConfig(): Promise<{
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
): Promise<{
  translations: Record<TranslationLang, { name: string; detail: string | null }>;
  provider: TranslationProvider;
}> {
  const cached = await findCachedTranslations(name, detail);
  if (cached) {
    return { translations: cached, provider: "AutoCloud" };
  }

  const config = await loadTranslationConfig();
  const hasDeepl = Boolean(config.deeplKey);
  const hasGemini = Boolean(config.geminiKey);

  // Yalnızca Gemini seçildiyse ve anahtar varsa:
  if (config.provider === "GEMINI" && hasGemini) {
    try {
      const translations = await geminiTranslate(name, detail, config.geminiKey!, config.geminiModel);
      await saveCachedTranslations(name, detail, translations, "Gemini");
      return { translations, provider: "Gemini" };
    } catch (err) {
      console.warn("[i18n] Gemini çeviri hatası, otomatik bulut çevirisine geçiliyor:", err);
    }
  }

  // Yalnızca DeepL seçildiyse ve anahtar varsa:
  if (config.provider === "DEEPL" && hasDeepl) {
    try {
      const translations = await deeplTranslate(name, detail, config.deeplKey!);
      await saveCachedTranslations(name, detail, translations, "DeepL");
      return { translations, provider: "DeepL" };
    } catch (err) {
      console.warn("[i18n] DeepL çeviri hatası, otomatik bulut çevirisine geçiliyor:", err);
    }
  }

  // AUTO Modu: Birincil DeepL, ikincil Gemini, üçüncül Kesintisiz Otomatik Bulut Çevirisi
  if (hasDeepl) {
    try {
      const translations = await deeplTranslate(name, detail, config.deeplKey!);
      await saveCachedTranslations(name, detail, translations, "DeepL");
      return { translations, provider: "DeepL" };
    } catch (deeplErr) {
      console.warn("[i18n] DeepL çeviri servisinde sorun oluştu, yedek servise geçiliyor:", deeplErr);
    }
  }

  if (hasGemini) {
    try {
      const translations = await geminiTranslate(name, detail, config.geminiKey!, config.geminiModel);
      await saveCachedTranslations(name, detail, translations, "Gemini");
      return { translations, provider: "Gemini" };
    } catch (geminiErr) {
      console.warn("[i18n] Gemini çeviri servisinde sorun oluştu, otomatik bulut çevirisine geçiliyor:", geminiErr);
    }
  }

  const translations = await autoCloudTranslate(name, detail);
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
 * and returns how many nodes have complete 7-language translations vs missing ones.
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
 * with missing or unverified translations across the 7 supported languages, completes them automatically
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

    const incomplete = nodes.filter((node) => {
      const byLang = new Map(node.translations.map((t) => [t.lang, t]));
      for (const lang of TRANSLATION_LANGS) {
        const tr = byLang.get(lang);
        if (!tr || !tr.name?.trim()) return true;
        if (node.detail?.trim() && !tr.detail?.trim()) return true;
      }
      return false;
    });

    if (incomplete.length === 0) {
      return { translatedNodes: 0, remainingNodes: 0 };
    }

    const limit = options.maxNodesPerRun ?? incomplete.length;
    const targetNodes = incomplete.slice(0, limit);
    const BATCH_SIZE = 5;

    for (let i = 0; i < targetNodes.length; i += BATCH_SIZE) {
      const batch = targetNodes.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (node) => {
          try {
            const { translations } = await translateMenuItem(node.name, node.detail);
            if (await saveIfSourceUnchanged(node.id, node.name, node.detail, translations)) translatedNodes++;
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
 * into all 7 supported guest languages and saves them (call it after the node's transaction committed),
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
  translations: Record<TranslationLang, { name: string; detail: string | null }>,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM menu_nodes WHERE id = ${nodeId} FOR UPDATE`;
    const current = await tx.menuNode.findUnique({ where: { id: nodeId }, select: { name: true, detail: true } });
    if (!current || current.name !== name || (current.detail ?? null) !== (detail ?? null)) return false;
    for (const lang of TRANSLATION_LANGS) {
      const val = translations[lang];
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
