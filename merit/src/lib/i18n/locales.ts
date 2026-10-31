export const LOCALES = ["tr", "en", "de", "ru", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** Cookie that remembers the guest's language choice. */
export const LANG_COOKIE = "merit_lang";

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

export const isRtl = (locale: Locale): boolean => locale === "ar";

/** Languages from an Accept-Language header, best quality first (ties keep header order). */
function acceptedLanguages(header: string): string[] {
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { base: tag.trim().toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.base !== "" && entry.base !== "*" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.base);
}

/** `?lang` first, then the `merit_lang` cookie, then the first supported Accept-Language, else `en`. */
export function pickLocale(input: { query?: string; cookie?: string; acceptLanguage?: string }): Locale {
  if (isLocale(input.query)) return input.query;
  if (isLocale(input.cookie)) return input.cookie;
  if (input.acceptLanguage) {
    const match = acceptedLanguages(input.acceptLanguage).find(isLocale);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
