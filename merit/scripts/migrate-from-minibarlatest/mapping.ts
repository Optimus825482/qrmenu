import type { HotelCode } from "./config";

/** ASCII-folds (Turkish dotted/dotless i included) and lowercases. */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .trim();
}

/**
 * Hotel code from the legacy hotel name. Order is binding: the Diamond and Premium names also contain
 * "royal".
 */
export function hotelCodeFor(name: string): HotelCode | null {
  const n = fold(name);
  if (n.includes("diamond")) return "DIAMOND";
  if (n.includes("premium")) return "PREMIUM";
  if (n.includes("royal")) return "ROYAL";
  return null;
}

export function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function orNull(value: unknown): string | null {
  const s = clean(value);
  return s === "" ? null : s;
}

export function truncate(text: string, max: number): { value: string; cut: boolean } {
  const chars = [...text];
  return chars.length > max ? { value: chars.slice(0, max).join(""), cut: true } : { value: text, cut: false };
}

/** Decimal(10,2) from a legacy numeric; null when absent, negative, not finite or too large. */
export function parsePrice(value: unknown): { value: string | null; valid: boolean } {
  if (value === null || value === undefined || clean(value) === "") return { value: null, valid: true };
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n >= 100_000_000) return { value: null, valid: false };
  return { value: n.toFixed(2), valid: true };
}

export function toBool(value: unknown, fallback: boolean): boolean {
  return value === null || value === undefined ? fallback : Boolean(value);
}
