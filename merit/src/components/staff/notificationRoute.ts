/**
 * Personel kabuğunda (tablet/telefon) bir bildirime dokununca açılacak sayfa. Masaüstündeki
 * `notificationTarget` pencere açar; burada ekranlar birer rota olduğu için ayrı bir eşleme gerekir.
 * Adaylar sırayla denenir ve kullanıcının menüsünde olan ilk sayfa seçilir (menü yetkiden türediği için
 * bildirim, açılamayacak bir sayfaya asla götürmez). Uygun sayfa yoksa null: bildirim yalnız okundu olur.
 */
export type StaffNotificationRef = { type: string; refType: string | null; title?: string };

const BY_REF: Record<string, readonly string[]> = {
  MybarRequest: ["/kat/mybar", "/depo/mybar"],
  WaiterCall: ["/garson/cagrilar"],
  MinibarManualEntryRequest: ["/kat/manuel-kayit"],
  MinibarCorrectionRequest: ["/kat/duzeltme-onay", "/kat/islemlerim"],
  StockCorrectionRequest: ["/kat/duzeltme-onay", "/depo/stok"],
  MinibarTransaction: ["/kat/islemlerim", "/kat/duzeltme-onay"],
  StockRequest: ["/depo/stok", "/kat/stok"],
  HotelStock: ["/depo/stok", "/kat/stok"],
  HotelStockExpiry: ["/depo/stok", "/kat/stok"],
  StockReceipt: ["/depo/stok", "/kat/stok"],
  OpeningStock: ["/depo/stok", "/kat/stok"],
  RoomDnd: ["/kat"],
  MinibarDay: ["/kat/tavsiye-is-plani", "/kat"],
  OccupancyUpload: ["/depo/doluluk-yukle"],
  MenuNode: ["/oda-servisi/menu"],
};

/** Kayıt türü yazılmamış bildirimler için tür önekinden tahmin (ilk eşleşen kazanır). */
const BY_TYPE_PREFIX: readonly (readonly [string, readonly string[]])[] = [
  ["mybar.", BY_REF.MybarRequest],
  ["call.", BY_REF.WaiterCall],
  ["minibar.manual.", BY_REF.MinibarManualEntryRequest],
  ["minibar.correction.", BY_REF.MinibarTransaction],
  ["stock.correction", BY_REF.StockCorrectionRequest],
  ["stockrequest.", BY_REF.StockRequest],
  ["stock.", BY_REF.HotelStock],
  ["dnd.", BY_REF.RoomDnd],
  ["task.", BY_REF.MinibarDay],
  ["occupancy.", BY_REF.OccupancyUpload],
  ["upload.", BY_REF.OccupancyUpload],
];

const TABLE_FIRST = ["/garson", "/oda-servisi"] as const;
const ROOM_FIRST = ["/oda-servisi", "/garson"] as const;

/** Sipariş bildirimleri: oda servisi olanlar Talepler'e, masa siparişleri garson kuyruğuna gider. */
function orderCandidates(n: StaffNotificationRef): readonly string[] {
  if (n.type.startsWith("order.sla.")) return ROOM_FIRST;
  return (n.title ?? "").toLocaleLowerCase("tr-TR").includes("oda servisi") ? ROOM_FIRST : TABLE_FIRST;
}

export function staffNotificationCandidates(n: StaffNotificationRef): readonly string[] {
  if (n.refType === "Order" || n.type.startsWith("order.")) return orderCandidates(n);
  const byRef = n.refType ? BY_REF[n.refType] : undefined;
  return byRef ?? BY_TYPE_PREFIX.find(([prefix]) => n.type.startsWith(prefix))?.[1] ?? [];
}

/** `navHrefs`: kullanıcının menüsündeki bağlantılar (sorgu kısmı yok sayılır). */
export function staffNotificationHref(n: StaffNotificationRef, navHrefs: Iterable<string>): string | null {
  const allowed = new Set<string>();
  for (const href of navHrefs) if (href) allowed.add(href.split("?")[0]);
  return staffNotificationCandidates(n).find((path) => allowed.has(path)) ?? null;
}
