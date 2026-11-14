import type { ModuleKey } from "@/generated/prisma/client";

export interface ScreenDef {
  code: string;
  moduleKey: ModuleKey;
  name: string;
  path: string;
  group: string;
  sortOrder: number;
}

/** Turkish menu-group label shown for each module's screens. */
export const MODULE_GROUPS: Record<ModuleKey, string> = {
  MINIBAR: "Minibar Takip",
  QR_MENU: "QR Menü",
  QR_ORDER: "QR Sipariş",
  ROOM_SERVICE: "QR Oda Servisi",
  CORE: "Ortak / Çekirdek",
};

/** Screens in catalogue order; sortOrder is the 1-based position in this list. */
const CATALOG: ReadonlyArray<readonly [ModuleKey, string, string, string]> = [
  // MINIBAR
  ["MINIBAR", "MB-KAT", "Kat Planı", "/kat"],
  ["MINIBAR", "MB-KF", "Kat Formu — QR", "/kat/qr"],
  ["MINIBAR", "MB-TUK", "Oda Kontrolü", "/kat"],
  ["MINIBAR", "MB-ZIM", "Otel Deposu", "/depo/stok"],
  ["MINIBAR", "MB-TAL", "Düzeltme ve Ek Talepler", "/kat/duzeltme-onay"],
  ["MINIBAR", "MB-DOL", "Doluluk Yükleme", "/depo/doluluk-yukle"],
  ["MINIBAR", "MB-PERS", "MyBar Talepleri", "/kat?filtre=mybar"],
  ["MINIBAR", "MB-DND", "DND Kayıtları", "/kat?filtre=dnd"],
  ["MINIBAR", "MB-RAP", "Minibar Raporları", "/depo/raporlar"],
  ["MINIBAR", "MB-TAN", "Minibar Tanımları", "/depo/tanimlar"],
  // QR_MENU
  ["QR_MENU", "QM-MIS", "Misafir Menü Görünümü", "/q"],
  ["QR_MENU", "QM-CAG", "Garson Çağrı Ekranı", "/garson/cagrilar"],
  ["QR_MENU", "QM-MEN", "Menü Yönetimi", "/admin#menu.yonetim"],
  ["QR_MENU", "QM-TEM", "Menü Tasarım Merkezi", "/admin#menu.tema"],
  ["QR_MENU", "QM-RAP", "Menü Raporları", "/admin#menu.rapor"],
  // QR_ORDER
  ["QR_ORDER", "QS-KUY", "Outlet Garson Ekranı", "/garson"],
  ["QR_ORDER", "QS-KAS", "Outlet Kasa Ekranı", "/kasa"],
  ["QR_ORDER", "QS-KDS", "Outlet Mutfak Ekranı", "/kds"],
  ["QR_ORDER", "QS-FIS", "Fiş Yazıcı Kuyruğu", "/kasa/yazici"],
  ["QR_ORDER", "QS-IPT", "İptal / Düzeltme", "/kasa/iptal"],
  ["QR_ORDER", "QS-RAP", "Sipariş Raporları", "/admin#order.rapor"],
  // ROOM_SERVICE
  ["ROOM_SERVICE", "RO-TAL", "Oda Servisi Talepleri", "/oda-servisi"],
  ["ROOM_SERVICE", "RO-TES", "Teslim Takibi", "/oda-servisi/teslim"],
  ["ROOM_SERVICE", "RO-SLA", "SLA Raporları", "/admin#rs.rapor"],
  // CORE
  ["CORE", "CR-KOM", "Komuta Merkezi", "/admin"],
  ["CORE", "CR-RAD", "Canlı Radar", "/radar"],
  ["CORE", "CR-ONL", "Online Kullanıcılar", "/admin#core.online"],
  ["CORE", "CR-RAP", "Raporlar", "/admin#core.rapor"],
  ["CORE", "CR-KUL", "Kullanıcı Yönetimi", "/admin#core.kullanici"],
  ["CORE", "CR-SYS", "Sistem Ayarları", "/admin#core.ayarlar"],
  ["CORE", "CR-DEN", "Denetim Günlüğü", "/admin#core.denetim"],
  ["CORE", "CR-TAN", "Tanımlamalar", "/admin#core.tanimlar"],
  ["CORE", "CR-REH", "Kurulum Rehberi", "/admin#core.rehber"],
  // The live counters widget (desktop, personel/tablet and mobile shells). Last, so earlier sort orders stay.
  ["CORE", "CR-DUR", "Anlık Durum", "/admin#core.durum"],
  // Oda Kontrol İşlemleri (14 Kas 2026): the room check records of all staff, edit / delete of any day. Last, so earlier
  // sort orders stay; the permission matrix lists it with the other MINIBAR screens.
  ["MINIBAR", "MB-OKI", "Oda Kontrol İşlemleri", "/kat/oda-kontrol-islemleri"],
  // Minibar Takip (14 Kas 2026): the read-only floor grid of the minibar room checks for the room-service team, every
  // hotel selectable. A ROOM_SERVICE screen on purpose: that team's roles do not hold the MINIBAR module.
  ["ROOM_SERVICE", "RO-MBT", "Minibar Takip", "/oda-servisi/minibar-takip"],
  // Oteller Arası Oda Servisi (14 Kas 2026): the window that lets a user watch or process the room-service requests
  // of another hotel for a while. Its own screen, so the Yetki Matrisi decides who sees it (V), who gives a
  // permission (O) and who removes one (D); until then it rode on RO-TAL approve and a fixed role list.
  ["ROOM_SERVICE", "RO-OTA", "Oteller Arası Oda Servisi", "/admin#rs.oteller-arasi"],
  // Sipariş ve Çağrı Yönetimi (14 Kas 2026): the system administrator's list of the table orders and guest calls of
  // every outlet of a hotel. V opens the window, D corrects a status, A cancels (with a reason).
  ["QR_ORDER", "QS-YON", "Sipariş ve Çağrı Yönetimi", "/admin#order.yonetim"],
];

export const SCREENS: ScreenDef[] = CATALOG.map(([moduleKey, code, name, path], index) => ({
  code,
  moduleKey,
  name,
  path,
  group: MODULE_GROUPS[moduleKey],
  sortOrder: index + 1,
}));
