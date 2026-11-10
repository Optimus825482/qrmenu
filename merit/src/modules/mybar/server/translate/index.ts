import { env } from "@/lib/env";
import { loadTranslationConfig } from "@/modules/menu/server/translations";
import { deeplProvider } from "./deepl";
import { geminiProvider } from "./gemini";
import { gtxProvider } from "./gtx";
import { noneProvider } from "./none";
import type { TranslationProvider } from "./provider";

let override: TranslationProvider | null = null;

/** The keyless provider chosen by the environment (TRANSLATE_PROVIDER): gtx or none. */
export function getTranslationProvider(): TranslationProvider {
  if (override) return override;
  return env.TRANSLATE_PROVIDER === "gtx" ? gtxProvider : noneProvider;
}

/** How long a resolved chain is reused: a key saved in Denetim Masası takes effect within this time. */
const CHAIN_TTL_MS = 30_000;
let cached: { chain: TranslationProvider[]; until: number } | null = null;

/**
 * Providers MyBar tries in order; empty means translation is off (nothing leaves the premises).
 *
 * The keys and the preferred provider are the ones of the menu translation (Denetim Masası → Sistem →
 * Çeviri, environment as fallback): DEEPL or GEMINI when chosen and keyed, AUTO = DeepL then Gemini.
 * The keyless gtx endpoint closes the chain only when TRANSLATE_PROVIDER=gtx.
 */
export async function resolveTranslationProviders(): Promise<TranslationProvider[]> {
  if (override) return override.name === "none" ? [] : [override];
  if (cached && cached.until > Date.now()) return cached.chain;
  const chain: TranslationProvider[] = [];
  try {
    const config = await loadTranslationConfig();
    const deepl = config.deeplKey ? deeplProvider(config.deeplKey) : null;
    const gemini = config.geminiKey ? geminiProvider(config.geminiKey, config.geminiModel) : null;
    if (config.provider === "GEMINI") {
      if (gemini) chain.push(gemini);
    } else if (config.provider === "DEEPL") {
      if (deepl) chain.push(deepl);
    } else {
      if (deepl) chain.push(deepl);
      if (gemini) chain.push(gemini);
    }
  } catch {
    // Settings unreadable: fall through to the environment's provider.
  }
  if (env.TRANSLATE_PROVIDER === "gtx") chain.push(gtxProvider);
  cached = { chain, until: Date.now() + CHAIN_TTL_MS };
  return chain;
}

export function setTranslationProviderForTests(provider: TranslationProvider | null): void {
  override = provider;
  cached = null;
}

export function resetTranslationProviderCacheForTests(): void {
  cached = null;
}
