/**
 * Tutar biçimi: otelin `price.currency` ayarındaki para birimiyle `Intl.NumberFormat`.
 * Arayüzde sabit "₺" / "€" yazılmaz; para birimi sunucudan (`resolveCurrency(hotelId)`) prop ile gelir.
 * Geçersiz para birimi kodu `RangeError` fırlatmaz: "12,00 XXX" biçiminde kodla birlikte döner.
 */
export function formatPrice(amount: number | string, currency: string, locale = "tr-TR"): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  try {
    if (!Intl.supportedValuesOf("currency").includes(currency)) throw new RangeError(currency);
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    const plain = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    return currency ? `${plain} ${currency}` : plain;
  }
}
