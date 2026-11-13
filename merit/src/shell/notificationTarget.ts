/**
 * Bildirime tıklanınca açılacak ekran: bildirimin bağlı olduğu kayıt türünden (refType) bulunur.
 * `focusId` verilen ekran o kaydı seçili açar (şimdilik MyBar Talepleri); diğerleri kaydın listelendiği
 * ekranı, bildirimin oteliyle açar. Eşleşme yoksa null: bildirim yalnızca okundu işaretlenir.
 */
export type NotificationRef = { type: string; refType: string | null; refId: string | null; hotelId: string | null };
export type NotificationTarget = { appId: string; hotelId?: string; focusId?: string };

const BY_REF: Record<string, string> = {
  MybarRequest: "minibar.mybar",
  MinibarManualEntryRequest: "minibar.onaylar",
  MinibarCorrectionRequest: "minibar.onaylar",
  MinibarTransaction: "minibar.onaylar",
  StockCorrectionRequest: "minibar.onaylar",
  StockRequest: "minibar.stok",
  HotelStock: "minibar.stok",
  HotelStockExpiry: "minibar.stok",
  StockReceipt: "minibar.stok",
  RoomDnd: "minibar.kat",
  MinibarDay: "minibar.kat",
  OccupancyUpload: "minibar.doluluk",
  PrintJob: "order.yazicilar",
  Outlet: "order.yazicilar",
  MailQueue: "core.rapor",
  AppScreen: "core.kullanici",
};

/** Kayıt türü yazılmamış eski bildirimler için tür önekinden tahmin. */
const BY_TYPE_PREFIX: [string, string][] = [
  ["mybar.", "minibar.mybar"],
  ["minibar.manual.", "minibar.onaylar"],
  ["minibar.correction.", "minibar.onaylar"],
  ["stock.correction", "minibar.onaylar"],
  ["stockrequest.", "minibar.stok"],
  ["stock.", "minibar.stok"],
  ["dnd.", "minibar.kat"],
  ["task.", "minibar.kat"],
  ["minibar.", "minibar.kat"],
  ["occupancy.", "minibar.doluluk"],
  ["print.", "order.yazicilar"],
  ["mail.", "core.rapor"],
];

/** Oda servisi siparişleri "Oda Servisi Kayıtları"nda; masa siparişlerinin masaüstü ekranı yok. */
const ROOM_SERVICE_ORDER_TYPES = new Set(["order.created", "order.sla.warn", "order.sla.breach", "order.confirmed"]);

export function notificationTarget(n: NotificationRef): NotificationTarget | null {
  let appId: string | undefined;
  if (n.refType === "Order") appId = ROOM_SERVICE_ORDER_TYPES.has(n.type) ? "rs.kayitlar" : undefined;
  else if (n.refType) appId = BY_REF[n.refType];
  appId ??= BY_TYPE_PREFIX.find(([prefix]) => n.type.startsWith(prefix))?.[1];
  if (!appId) return null;
  return {
    appId,
    ...(n.hotelId ? { hotelId: n.hotelId } : {}),
    ...(appId === "minibar.mybar" && n.refType === "MybarRequest" && n.refId ? { focusId: n.refId } : {}),
  };
}

/** `initialPanel` değeri: açılan ekrana "şu kaydı seç" der. */
export const FOCUS_PREFIX = "kayit:";
