/** Text of a number field as a number; blank or not a number = `undefined` (the server reports it). */
export function numberOrUndefined(text: string | undefined): number | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

export const OUTLET_TYPE_LABELS = {
  HAVUZ: "Havuz",
  BAR: "Bar",
  SAHIL: "Sahil",
  SALON: "Salon",
  BAHCE: "Bahçe",
  SPA: "Spa",
  CABANA: "Cabana",
  ODA_SERVISI: "Oda Servisi",
  GENEL: "Genel",
} as const;

export const PRICE_DISPLAY_LABELS = {
  INHERIT: "Menü ayarı",
  SHOW: "Göster",
  HIDE: "Gizle",
} as const;

export const MODULE_LABELS = {
  MINIBAR: "Minibar",
  QR_MENU: "QR Menü",
  QR_ORDER: "QR Sipariş",
  ROOM_SERVICE: "Oda Servisi",
} as const;
