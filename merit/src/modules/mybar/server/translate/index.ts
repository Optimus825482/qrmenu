import { env } from "@/lib/env";
import { gtxProvider } from "./gtx";
import { noneProvider } from "./none";
import type { TranslationProvider } from "./provider";

let override: TranslationProvider | null = null;

export function getTranslationProvider(): TranslationProvider {
  if (override) return override;
  return env.TRANSLATE_PROVIDER === "gtx" ? gtxProvider : noneProvider;
}

export function setTranslationProviderForTests(provider: TranslationProvider | null): void {
  override = provider;
}
