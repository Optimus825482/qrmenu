/*
 * Oda QR servisinin yerel sabitleri (Minibar T1 henuz inmedi; T1 gelince `constants.ts` /
 * `events.ts` icine tasinabilir). Denetim eylem adlari, hiz siniri ve mesaj sinirlari burada.
 */

export const ROOM_QR_AUDIT = {
  generate: "ROOM_QR_GENERATE",
  regenerate: "ROOM_QR_REGENERATE",
  bulk: "ROOM_QR_BULK_GENERATE",
  guestMessage: "ROOM_GUEST_MESSAGE_SET",
} as const;

/** Kullanici basina dakikada: tekil uretim/yenileme ve toplu uretim. */
export const ROOM_QR_RATE = {
  single: { max: 30, windowMs: 60_000 },
  bulk: { max: 3, windowMs: 60_000 },
} as const;

export const ROOM_QR_RATE_MESSAGE = "Çok fazla QR oluşturma denemesi. Lütfen 1 dakika bekleyin";

export const ROOM_GUEST_MESSAGE_MAX = 500;
export const ROOM_QR_PRINT_MAX = 500;
