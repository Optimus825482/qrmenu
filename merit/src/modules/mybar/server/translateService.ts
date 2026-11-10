import { createHash } from "node:crypto";
import type { Locale } from "@/lib/i18n/locales";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { resolveTranslationProviders } from "./translate";
import type { TranslateResult, TranslationProvider } from "./translate/provider";

export const TRANSLATE_TIMEOUT_MS = 3500;
const MAX_TEXT = 600;
const CONCURRENCY = 4;
export const WARM_BATCH_MAX = 50;
export const NOTE_MAX = 500;
const MISS_TTL_MS = 60 * 60 * 1000;

/** In-flight hash:lang keys, so concurrent renders do not repeat provider calls. */
const inflight = new Set<string>();
/** Texts the provider left unchanged (brand names, already target language): hash:lang -> expiry. */
const misses = new Map<string, number>();

export function resetTranslationMemoryForTests(): void {
  inflight.clear();
  misses.clear();
}

const keyOf = (text: string, lang: string) => `${sha(text)}:${lang}`;
const isMiss = (key: string) => {
  const until = misses.get(key);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  misses.delete(key);
  return false;
};

/** Strips HTML tags and control characters, trims. */
export function cleanNote(note: string): string {
  return note
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function warn(provider: string, error: unknown, kind: "çeviri" | "önbellek yazımı" = "çeviri"): void {
  // Never log the text itself: guest notes are personal data.
  console.warn(`[translate] ${provider} ${kind} başarısız: ${error instanceof Error ? error.name : "hata"}`);
}

async function callOne(provider: TranslationProvider, text: string, to: string, from: string | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const call = provider.translate(text, { to, from, signal: controller.signal });
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("TimeoutError")), { once: true });
    });
    return await Promise.race([call, aborted]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tries the providers in order and returns the first answer with the name of the provider that gave it.
 * A failed provider is logged and the next one is tried; the last failure is thrown.
 */
async function callProviders(
  providers: TranslationProvider[],
  text: string,
  to: string,
  from: string | undefined,
  timeoutFor: (provider: TranslationProvider) => number,
): Promise<TranslateResult & { provider: string }> {
  let last: unknown = new Error("çeviri sağlayıcısı yok");
  for (const [index, provider] of providers.entries()) {
    try {
      return { ...(await callOne(provider, text, to, from, timeoutFor(provider))), provider: provider.name };
    } catch (error) {
      last = error;
      if (index < providers.length - 1) warn(provider.name, error);
    }
  }
  throw last;
}

/** Guest note -> Turkish for staff. Never throws; any failure yields nulls (the request must still go through). */
export async function translateNoteForStaff(
  hotelId: string,
  note: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ noteTr: string | null; srcLang: string | null }> {
  const none = { noteTr: null, srcLang: null };
  const text = cleanNote(note);
  if (!text || text.length > NOTE_MAX) return none;
  let providers: TranslationProvider[] = [];
  try {
    providers = await resolveTranslationProviders();
    if (providers.length === 0) return none;
    if (!(await getSetting("mybar.translateNotes", hotelId))) return none;
    // The guest is waiting for the request to go through: the whole chain shares roughly one budget.
    const budget = opts.timeoutMs ?? TRANSLATE_TIMEOUT_MS;
    const each = providers.length > 1 ? Math.max(1500, Math.floor(budget / providers.length)) : budget;
    const result = await callProviders(providers, text, "tr", undefined, () => each);
    if (!result.translated) return { noteTr: null, srcLang: result.sourceLang };
    return { noteTr: result.text, srcLang: result.sourceLang };
  } catch (error) {
    warn(providers.at(-1)?.name ?? "translate", error);
    return none;
  }
}

/** Turkish names/messages -> guest language. Misses fall back to the Turkish original and warm the cache in the background. */
export async function localizeTexts(texts: string[], lang: Locale): Promise<Map<string, string>> {
  const out = new Map<string, string>(texts.map((t) => [t, t]));
  if (lang === "tr" || (await resolveTranslationProviders()).length === 0) return out;
  const unique = [...new Set(texts.filter((t) => t.length > 0 && t.length <= MAX_TEXT))];
  if (unique.length === 0) return out;
  try {
    const rows = await prisma.textTranslation.findMany({
      where: { targetLang: lang, sourceHash: { in: unique.map(sha) } },
      select: { sourceHash: true, translated: true },
    });
    const byHash = new Map(rows.map((r) => [r.sourceHash, r.translated]));
    const missing: string[] = [];
    for (const text of unique) {
      const hit = byHash.get(sha(text));
      if (hit) out.set(text, hit);
      else if (!isMiss(keyOf(text, lang))) missing.push(text);
    }
    if (missing.length > 0) void warmTranslations(missing, lang).catch((error) => warn("cache", error, "önbellek yazımı"));
  } catch (error) {
    warn("cache", error, "önbellek yazımı");
  }
  return out;
}

/** Translates and stores the given Turkish texts; returns how many rows were written. */
export async function warmTranslations(texts: string[], lang: Locale): Promise<number> {
  const providers = lang === "tr" ? [] : await resolveTranslationProviders();
  if (providers.length === 0) return 0;
  const lastName = providers[providers.length - 1].name;
  const queue = [...new Set(texts)]
    .filter((t) => t.length > 0 && t.length <= MAX_TEXT && !isMiss(keyOf(t, lang)) && !inflight.has(keyOf(t, lang)))
    .slice(0, WARM_BATCH_MAX);
  for (const t of queue) inflight.add(keyOf(t, lang));
  let written = 0;
  async function worker(): Promise<void> {
    for (let text = queue.shift(); text !== undefined; text = queue.shift()) {
      const memKey = keyOf(text, lang);
      try {
        let result;
        try {
          result = await callProviders(providers, text, lang, "tr", (p) => p.backgroundTimeoutMs ?? TRANSLATE_TIMEOUT_MS);
        } catch (error) {
          warn(lastName, error);
          continue;
        }
        if (!result.translated || !result.text || result.text.length > 1200) {
          misses.set(memKey, Date.now() + MISS_TTL_MS);
          continue;
        }
        const key = { sourceHash: sha(text), targetLang: lang };
        try {
          await prisma.textTranslation.upsert({
            where: { sourceHash_targetLang: key },
            create: { ...key, sourceText: text, translated: result.text, provider: result.provider },
            update: { translated: result.text, provider: result.provider },
          });
          written += 1;
        } catch (error) {
          warn(result.provider, error, "önbellek yazımı");
        }
      } finally {
        inflight.delete(memKey);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return written;
}
