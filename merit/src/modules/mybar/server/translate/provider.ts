export type TranslateResult = { text: string; sourceLang: string; translated: boolean };

export interface TranslationProvider {
  readonly name: string;
  /** Time budget of one background (cache-warming) call; the default is TRANSLATE_TIMEOUT_MS. */
  readonly backgroundTimeoutMs?: number;
  translate(text: string, opts: { to: string; from?: string; signal: AbortSignal }): Promise<TranslateResult>;
}
