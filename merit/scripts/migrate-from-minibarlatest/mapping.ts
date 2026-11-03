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

// ---------------------------------------------------------------- users, requests, e-mail (Task 13)

export type RoleCode = "R-SYS" | "R-OTM" | "R-DEP" | "R-KAT";

/** Target role of a legacy role name; null = unknown (the user is not migrated). */
export function roleCodeFor(rol: string): RoleCode | null {
  switch (fold(String(rol ?? ""))) {
    case "sistem_yoneticisi":
    case "superadmin":
      return "R-SYS";
    case "admin":
      return "R-OTM";
    case "depo_sorumlusu":
      return "R-DEP";
    case "kat_sorumlusu":
      return "R-KAT";
    default:
      return null;
  }
}

export type StockRequestStatusName = "BEKLEMEDE" | "ONAYLANDI" | "TESLIM_EDILDI" | "REDDEDILDI" | "IPTAL";
const STOCK_REQUEST_STATUS: Record<string, StockRequestStatusName> = {
  beklemede: "BEKLEMEDE",
  onaylandi: "ONAYLANDI",
  teslim_edildi: "TESLIM_EDILDI",
  reddedildi: "REDDEDILDI",
  iptal: "IPTAL",
};
export function stockRequestStatusFor(s: string): StockRequestStatusName {
  return STOCK_REQUEST_STATUS[fold(String(s ?? ""))] ?? "BEKLEMEDE";
}
export const isKnownStockRequestStatus = (s: string): boolean => fold(String(s ?? "")) in STOCK_REQUEST_STATUS;

export type EmailStatusName = "GONDERILDI" | "HATA" | "BEKLEMEDE";
export function emailStatusFor(s: string): EmailStatusName {
  const v = fold(String(s ?? ""));
  return v === "gonderildi" ? "GONDERILDI" : v === "hata" ? "HATA" : "BEKLEMEDE";
}

export type PasswordKind = "pbkdf2" | "bcrypt" | "scrypt" | "diger";
/** Hash family from the stored prefix only (the hash itself never reaches a report). */
export function passwordKindFor(hash: string): PasswordKind {
  if (hash.startsWith("pbkdf2:sha256")) return "pbkdf2";
  if (hash.startsWith("$2")) return "bcrypt";
  if (hash.startsWith("scrypt")) return "scrypt";
  return "diger";
}

// ---------------------------------------------------------------- history (Task 13)

export type MybarStatusName = "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL";
export function dolumStatusFor(s: string): { status: MybarStatusName; mapped: boolean; known: boolean } {
  switch (fold(String(s ?? ""))) {
    case "beklemede":
      return { status: "BEKLEMEDE", mapped: false, known: true };
    case "tamamlandi":
      return { status: "TAMAMLANDI", mapped: false, known: true };
    case "iptal":
      return { status: "IPTAL", mapped: false, known: true };
    case "onaylandi":
      return { status: "TAMAMLANDI", mapped: true, known: true };
    case "reddedildi":
      return { status: "IPTAL", mapped: true, known: true };
    default:
      return { status: "BEKLEMEDE", mapped: false, known: false };
  }
}

export type RoomCheckTypeName = "URUN_EKLENDI" | "SARFIYAT_YOK" | "DND" | "ACIK";
const CHECK_TYPES: Record<string, RoomCheckTypeName> = { urun_eklendi: "URUN_EKLENDI", sarfiyat_yok: "SARFIYAT_YOK", dnd: "DND" };
export function checkTypeFor(s: string): RoomCheckTypeName {
  return CHECK_TYPES[fold(String(s ?? ""))] ?? "ACIK";
}
export const isKnownCheckType = (s: string): boolean => fold(String(s ?? "")) in CHECK_TYPES;

export interface MybarCandidate {
  id: string;
  odaId: string;
  tamamlayanId: string | null;
  talepAt: Date;
  tamamlanmaAt: Date | null;
  durum: string;
}

/**
 * The completed MyBar request a minibar transaction fulfilled: same room, same completing staff member and the
 * transaction instant inside [request, completion + windowMin]; several candidates -> closest to the completion.
 */
export function matchMybar(
  islem: { odaId: string; personelId: string; at: Date },
  talepler: MybarCandidate[],
  windowMin: number,
): string | null {
  let best: { id: string; dist: number } | null = null;
  for (const t of talepler) {
    if (fold(t.durum) !== "tamamlandi" || !t.tamamlanmaAt) continue;
    if (t.odaId !== islem.odaId || t.tamamlayanId === null || t.tamamlayanId !== islem.personelId) continue;
    const at = islem.at.getTime();
    if (at < t.talepAt.getTime() || at > t.tamamlanmaAt.getTime() + windowMin * 60_000) continue;
    const dist = Math.abs(at - t.tamamlanmaAt.getTime());
    if (!best || dist < best.dist) best = { id: t.id, dist };
  }
  return best?.id ?? null;
}

export type MinibarTxTypeName = "SETUP_KONTROL" | "SARFIYAT_YOK" | "MYBAR_KARSILAMA" | "LEGACY";
export function txTypeFor(islemTipi: string, matchedMybar: boolean): { type: MinibarTxTypeName; legacyType: string | null } {
  const t = fold(String(islemTipi ?? ""));
  if (t === "setup_kontrol") return { type: "SETUP_KONTROL", legacyType: null };
  if (t === "sarfiyat_yok") return { type: "SARFIYAT_YOK", legacyType: null };
  if (t === "ekstra_ekleme" && matchedMybar) return { type: "MYBAR_KARSILAMA", legacyType: null };
  return { type: "LEGACY", legacyType: String(islemTipi ?? "") };
}

export type StockMovementTypeName = "GIRIS" | "IADE" | "KULLANIM" | "MYBAR" | "DUZELTME" | "GOC";
/** Signed pool movement (effect on the remaining quantity) of a legacy `personel_zimmet_kullanim` row. */
export function movementFor(
  islemTipi: string,
  mybarRef: boolean,
  miktar: number,
): { type: StockMovementTypeName; qty: number; notePrefix: string | null; known: boolean } {
  const n = Math.abs(Math.trunc(miktar));
  const neg = n === 0 ? 0 : -n;
  switch (fold(String(islemTipi ?? ""))) {
    case "minibar_kullanim":
      return { type: mybarRef ? "MYBAR" : "KULLANIM", qty: neg, notePrefix: null, known: true };
    case "iade":
      return { type: "DUZELTME", qty: n, notePrefix: "Legacy iade: ", known: true };
    case "duzeltme":
      return { type: "DUZELTME", qty: neg, notePrefix: null, known: true };
    default:
      return { type: "KULLANIM", qty: neg, notePrefix: null, known: false };
  }
}
