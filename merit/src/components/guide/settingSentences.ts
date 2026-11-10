import type { SettingKey } from "@/lib/settings-defs";

/**
 * Turns a setting's CURRENT value into the Turkish sentence shown in the help sheet. A value of an
 * unexpected type yields no sentence (never a wrong one).
 */
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const flag = (v: unknown): v is boolean => typeof v === "boolean";

export const SETTING_SENTENCES: Partial<Record<SettingKey, (value: unknown) => string | null>> = {
  "dnd.minChecks": (v) => (num(v) ? `DND, ${v} kontrolde tamamlanır` : null),
  "dnd.recheckMinutes": (v) => (num(v) ? `DND odada kontroller arasında ${v} dakika beklenir` : null),
  "mybar.dailyLimit": (v) =>
    flag(v) ? (v ? "MyBar günde 1 kez işlenir" : "MyBar gün içinde birden çok kez işlenebilir") : null,
  "stock.defaultCriticalLevel": (v) => (num(v) ? `Yeni ürünlerde varsayılan kritik seviye ${v}` : null),
  "occupancy.fileRetentionDays": (v) => (num(v) ? `Yüklenen doluluk dosyaları ${v} gün saklanır` : null),
  "order.callAlertSeconds": (v) => (num(v) ? `Açık çağrı ${v} saniye sonra uyarı verir` : null),
  "order.approvalEscalationMinutes": (v) =>
    num(v) ? `Onay bekleyen sipariş ${v} dakikada yöneticiye yükselir` : null,
  "price.display": (v) =>
    v === "SHOW" ? "Fiyatlar ekranda gösterilir" : v === "HIDE" ? "Fiyatlar ekranda gösterilmez" : null,
  "rs.slaMinutes": (v) => (num(v) ? `Oda servisi hedef süresi ${v} dakika` : null),
};

/** The sentence for one setting, or `null` when the key has none (it is then left out). */
export function settingSentence(key: SettingKey, value: unknown): string | null {
  return SETTING_SENTENCES[key]?.(value) ?? null;
}

export function settingSentences(values: Partial<Record<SettingKey, unknown>>): string[] {
  const out: string[] = [];
  for (const key of Object.keys(values) as SettingKey[]) {
    const sentence = settingSentence(key, values[key]);
    if (sentence) out.push(sentence);
  }
  return out;
}
