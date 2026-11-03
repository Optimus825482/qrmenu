import { createHash } from "node:crypto";
import type { Locale } from "@/lib/i18n/locales";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getTranslationProvider } from "./translate";

export const TRANSLATE_TIMEOUT_MS = 3500;
const MAX_TEXT = 600;
const CONCURRENCY = 4;

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function warn(provider: string, error: unknown): void {
  // Never log the text itself: guest notes are personal data.
  console.warn(`[translate] ${provider} çevirisi başarısız: ${error instanceof Error ? error.name : "hata"}`);
}

async function callProvider(text: string, to: string, from: string | undefined, timeoutMs: number) {
  const provider = getTranslationProvider();
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

/** Guest note -> Turkish for staff. Never throws; any failure yields nulls (the request must still go through). */
export async function translateNoteForStaff(
  hotelId: string,
  note: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ noteTr: string | null; srcLang: string | null }> {
  const none = { noteTr: null, srcLang: null };
  const text = note.trim();
  if (!text) return none;
  const provider = getTranslationProvider();
  try {
    if (provider.name === "none") return none;
    if (!(await getSetting("mybar.translateNotes", hotelId))) return none;
    const result = await callProvider(text, "tr", undefined, opts.timeoutMs ?? TRANSLATE_TIMEOUT_MS);
    if (!result.translated) return { noteTr: null, srcLang: result.sourceLang };
    return { noteTr: result.text, srcLang: result.sourceLang };
  } catch (error) {
    warn(provider.name, error);
    return none;
  }
}

/** Turkish names/messages -> guest language. Misses fall back to the Turkish original and warm the cache in the background. */
export async function localizeTexts(texts: string[], lang: Locale): Promise<Map<string, string>> {
  const out = new Map<string, string>(texts.map((t) => [t, t]));
  if (lang === "tr" || getTranslationProvider().name === "none") return out;
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
      else missing.push(text);
    }
    if (missing.length > 0) void warmTranslations(missing, lang).catch((error) => warn("cache", error));
  } catch (error) {
    warn("cache", error);
  }
  return out;
}

/** Translates and stores the given Turkish texts; returns how many rows were written. */
export async function warmTranslations(texts: string[], lang: Locale): Promise<number> {
  const provider = getTranslationProvider();
  if (lang === "tr" || provider.name === "none") return 0;
  const queue = [...new Set(texts)].filter((t) => t.length > 0 && t.length <= MAX_TEXT);
  let written = 0;
  async function worker(): Promise<void> {
    for (let text = queue.shift(); text !== undefined; text = queue.shift()) {
      try {
        const result = await callProvider(text, lang, "tr", TRANSLATE_TIMEOUT_MS);
        if (!result.translated || !result.text || result.text.length > 1200) continue;
        const key = { sourceHash: sha(text), targetLang: lang };
        await prisma.textTranslation.upsert({
          where: { sourceHash_targetLang: key },
          create: { ...key, sourceText: text, translated: result.text, provider: provider.name },
          update: { translated: result.text, provider: provider.name },
        });
        written += 1;
      } catch (error) {
        warn(provider.name, error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return written;
}
