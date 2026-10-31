import type { Locale } from "@/lib/i18n/locales";

/** Formats a decimal string as money in the guest's language; unknown currencies fall back to "12.00 XXX". */
export function priceFormatter(locale: Locale, currency: string): (amount: string) => string {
  try {
    const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
    return (amount) => fmt.format(Number(amount));
  } catch {
    return (amount) => `${amount} ${currency}`;
  }
}
