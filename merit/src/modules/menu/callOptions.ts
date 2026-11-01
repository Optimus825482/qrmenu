export const CALL_LANGS = ["en", "de", "ru", "ar"] as const;
export type CallLang = (typeof CALL_LANGS)[number];

export type CallType = "GARSON" | "HESAP" | "DIGER";

export type GuestCallOption = {
  id: string;
  label: string;
  translations: Partial<Record<CallLang, string>>;
  callType: CallType;
};

/**
 * Resolves a call option's localized label for a guest.
 * Returns the matching language translation if available and non-empty,
 * otherwise falls back to the canonical Turkish label.
 */
export function callOptionLabel(
  option: Pick<GuestCallOption, "label" | "translations">,
  locale: string,
): string {
  if (locale === "tr") {
    return option.label;
  }
  const translated = option.translations?.[locale as CallLang];
  if (translated && translated.trim().length > 0) {
    return translated.trim();
  }
  return option.label;
}
