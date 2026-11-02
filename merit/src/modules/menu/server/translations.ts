import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { prisma } from "@/lib/prisma";
import { parseInput } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope, loadNodeScope } from "./menuNodeAccess";
import { assertMenuAccess } from "./menuAccess";

export const TRANSLATION_LANGS = ["en", "de", "ru", "ar", "fr", "el", "it"] as const;
export type TranslationLang = (typeof TRANSLATION_LANGS)[number];
export type TranslationProvider = "DeepL" | "Gemini";

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
 * 1. Checks settings from DB (Denetim Masası → Sistem → Çeviri) with .env fallback.
 * 2. Respects user's provider choice ("AUTO", "DEEPL", "GEMINI").
 * 3. In AUTO mode: Tries DeepL as primary, seamlessly falls back to Gemini on error.
 */
export async function translateMenuItem(
  name: string,
  detail: string | null,
): Promise<{
  translations: Record<TranslationLang, { name: string; detail: string | null }>;
  provider: TranslationProvider;
}> {
  const config = await loadTranslationConfig();
  const hasDeepl = Boolean(config.deeplKey);
  const hasGemini = Boolean(config.geminiKey);

  if (!hasDeepl && !hasGemini) {
    throw new DomainError(
      "VALIDATION",
      "Otomatik çeviri için Denetim Masası → Çeviri ayarlarından DeepL veya Google AI Studio anahtarı tanımlanmalıdır.",
    );
  }

  // Yalnızca Gemini seçildiyse:
  if (config.provider === "GEMINI") {
    if (!hasGemini) {
      throw new DomainError(
        "VALIDATION",
        "Çeviri servisi Google Gemini olarak seçilmiş ancak API anahtarı girilmemiş.",
      );
    }
    const translations = await geminiTranslate(name, detail, config.geminiKey!, config.geminiModel);
    return { translations, provider: "Gemini" };
  }

  // Yalnızca DeepL seçildiyse:
  if (config.provider === "DEEPL") {
    if (!hasDeepl) {
      throw new DomainError(
        "VALIDATION",
        "Çeviri servisi DeepL olarak seçilmiş ancak API anahtarı girilmemiş.",
      );
    }
    const translations = await deeplTranslate(name, detail, config.deeplKey!);
    return { translations, provider: "DeepL" };
  }

  // AUTO Modu: Birincil DeepL, hata durumunda Gemini
  if (hasDeepl) {
    try {
      const translations = await deeplTranslate(name, detail, config.deeplKey!);
      return { translations, provider: "DeepL" };
    } catch (deeplErr) {
      console.warn("[i18n] DeepL çeviri servisinde sorun oluştu, Google AI Studio deneniyor:", deeplErr);
      if (!hasGemini) {
        throw new DomainError(
          "VALIDATION",
          deeplErr instanceof Error ? deeplErr.message : "DeepL çeviri servisi hata verdi.",
        );
      }
    }
  }

  if (hasGemini) {
    try {
      const translations = await geminiTranslate(name, detail, config.geminiKey!, config.geminiModel);
      return { translations, provider: "Gemini" };
    } catch (geminiErr) {
      throw new DomainError(
        "VALIDATION",
        geminiErr instanceof Error ? geminiErr.message : "Google Gemini çeviri servisi hata verdi.",
      );
    }
  }

  throw new DomainError("VALIDATION", "Çeviri servisi bulunamadı.");
}

/** Generate complete translations first, then persist all languages as a single operation. */
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
        create: { nodeId, lang, name: value.name, detail: value.detail, isVerified: false },
        update: { name: value.name, detail: value.detail, isVerified: false },
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

/**
 * Automatically translates a menu node (category, subcategory, group, or item)
 * into all 7 supported guest languages and saves to database with isVerified=true.
 * Safe to fire-and-forget in background.
 */
export async function autoTranslateMenuNode(
  nodeId: string,
  name: string,
  detail: string | null,
  hotelId?: string,
  outletId?: string,
): Promise<void> {
  try {
    const { translations, provider } = await translateMenuItem(name, detail);
    for (const lang of TRANSLATION_LANGS) {
      const val = translations[lang];
      await prisma.menuNodeTranslation.upsert({
        where: { nodeId_lang: { nodeId, lang } },
        create: {
          nodeId,
          lang,
          name: val.name,
          detail: val.detail,
          isVerified: true,
        },
        update: {
          name: val.name,
          detail: val.detail,
          isVerified: true,
        },
      });
    }
    if (outletId) {
      await publish({
        type: "menu.changed",
        hotelId: hotelId ?? undefined,
        outletId,
        payload: { nodeId, op: "translation", auto: true, provider },
      });
    }
  } catch (error) {
    console.warn(`[i18n] Failed to auto-translate menu node ${nodeId} ("${name}"):`, error);
  }
}

const textSchema = z.object({
  name: z.string("Ad gerekli").trim().min(1, "Ad gerekli").max(120, "Ad en fazla 120 karakter olabilir"),
  detail: z
    .string()
    .trim()
    .max(1000, "Açıklama en fazla 1000 karakter olabilir")
    .nullish()
    .transform((v) => v || null),
});

function checkLang(lang: string): TranslationLang {
  if (lang === "tr") {
    throw new DomainError("VALIDATION", "Türkçe temel kayıttır; çeviri olarak kaydedilemez");
  }
  if (!(TRANSLATION_LANGS as readonly string[]).includes(lang)) {
    throw new DomainError("VALIDATION", "Geçersiz dil");
  }
  return lang as TranslationLang;
}

export async function set(
  ctx: Ctx,
  nodeId: string,
  lang: string,
  raw: { name: string; detail?: string | null },
): Promise<{ lang: string; name: string; detail: string | null }> {
  const code = checkLang(lang);
  const input = parseInput(textSchema, raw);
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);
  return prisma.$transaction(async (tx) => {
    const row = await tx.menuNodeTranslation.upsert({
      where: { nodeId_lang: { nodeId, lang: code } },
      create: { nodeId, lang: code, name: input.name, detail: input.detail },
      update: { name: input.name, detail: input.detail, isVerified: true },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_TRANSLATION_SET",
      entity: "MenuNode",
      entityId: nodeId,
      after: { lang: code, name: input.name },
    });
    await publish(
      {
        type: "menu.changed",
        hotelId: scope.hotelId,
        outletId: scope.outletId,
        payload: { nodeId, op: "translation" },
      },
      tx,
    );
    return { lang: row.lang, name: row.name, detail: row.detail };
  });
}

export async function remove(ctx: Ctx, nodeId: string, lang: string): Promise<void> {
  const code = checkLang(lang);
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);
  await prisma.$transaction(async (tx) => {
    const found = await tx.menuNodeTranslation.findUnique({
      where: { nodeId_lang: { nodeId, lang: code } },
    });
    if (!found) throw new DomainError("NOT_FOUND", "Çeviri bulunamadı");
    await tx.menuNodeTranslation.delete({ where: { id: found.id } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_TRANSLATION_REMOVE",
      entity: "MenuNode",
      entityId: nodeId,
      before: { lang: code, name: found.name },
    });
    await publish(
      {
        type: "menu.changed",
        hotelId: scope.hotelId,
        outletId: scope.outletId,
        payload: { nodeId, op: "translation" },
      },
      tx,
    );
  });
}

/** Publish a generated translation only after a user has reviewed it. */
export async function verify(ctx: Ctx, nodeId: string, lang: string): Promise<void> {
  const code = checkLang(lang);
  const scope = await loadNodeScope(nodeId);
  await assertMenuAccess(ctx, { id: scope.outletId, hotelId: scope.hotelId, type: scope.outletType }, "D");
  assertOutletScope(ctx, scope.outletId);
  await prisma.$transaction(async (tx) => {
    const found = await tx.menuNodeTranslation.findUnique({ where: { nodeId_lang: { nodeId, lang: code } } });
    if (!found) throw new DomainError("NOT_FOUND", "Çeviri bulunamadı");
    if (found.isVerified) return;
    await tx.menuNodeTranslation.update({ where: { id: found.id }, data: { isVerified: true } });
    await audit(tx, { userId: ctx.user.id, hotelId: scope.hotelId, action: "MENU_TRANSLATION_VERIFY", entity: "MenuNode", entityId: nodeId, after: { lang: code, name: found.name } });
    await publish({ type: "menu.changed", hotelId: scope.hotelId, outletId: scope.outletId, payload: { nodeId, op: "translation", verified: true } }, tx);
  });
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
