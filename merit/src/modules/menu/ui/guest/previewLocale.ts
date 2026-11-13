import type { Locale } from "@/lib/i18n/locales";

/**
 * The staff preview (`/q/onizleme/{outletId}`) has no guest token, so the guest language route
 * (`/api/q/{token}/lang`) would send the operator to `/q/onizleme`, an unknown QR code. The preview
 * reads its language from `?lang=`: same address, only that parameter changes.
 */
export function previewLocaleUrl(currentHref: string, locale: Locale): string {
  const url = new URL(currentHref);
  url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}`;
}
