export type TranslateResult = { text: string; sourceLang: string; translated: boolean };

export interface TranslationProvider {
  readonly name: string;
  translate(text: string, opts: { to: string; from?: string; signal: AbortSignal }): Promise<TranslateResult>;
}
