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
  ["MINIBAR", "MB-TUK", "Oda Kontrolü", "/kat/oda-kontrol"],
  ["MINIBAR", "MB-ZIM", "Zimmet Havuzu", "/depo/havuz"],
  ["MINIBAR", "MB-TAL", "Ek Talepler", "/depo/talepler"],
  ["MINIBAR", "MB-DOL", "Doluluk Yükleme", "/depo/doluluk"],
  ["MINIBAR", "MB-PERS", "MyBar Talepleri", "/kat/mybar"],
  ["MINIBAR", "MB-DND", "DND Kayıtları", "/kat/dnd"],
  ["MINIBAR", "MB-RAP", "Minibar Raporları", "/admin#minibar.rapor"],
  ["MINIBAR", "MB-TAN", "Minibar Tanımları", "/admin#minibar.tanim"],
  // QR_MENU
  ["QR_MENU", "QM-MIS", "Misafir Menü Görünümü", "/q"],
  ["QR_MENU", "QM-CAG", "Garson Çağrı Ekranı", "/garson/cagrilar"],
  ["QR_MENU", "QM-MEN", "Menü Yönetimi", "/admin#menu.yonetim"],
  ["QR_MENU", "QM-TEM", "Tema Yönetimi", "/admin#menu.tema"],
  ["QR_MENU", "QM-RAP", "Menü Raporları", "/admin#menu.rapor"],
  // QR_ORDER
  ["QR_ORDER", "QS-KUY", "Sipariş Onay Kuyruğu", "/garson"],
  ["QR_ORDER", "QS-KAS", "Kasa Ekranı", "/kasa"],
  ["QR_ORDER", "QS-KDS", "Mutfak Ekranı (KDS)", "/kds"],
  ["QR_ORDER", "QS-FIS", "Fiş Yazıcı Kuyruğu", "/kasa/yazici"],
  ["QR_ORDER", "QS-IPT", "İptal / Düzeltme", "/kasa/iptal"],
  ["QR_ORDER", "QS-RAP", "Sipariş Raporları", "/admin#order.rapor"],
  // ROOM_SERVICE
  ["ROOM_SERVICE", "RO-TAL", "Oda Servisi Talepleri", "/oda-servisi"],
  ["ROOM_SERVICE", "RO-TEL", "Telefon Teyidi", "/oda-servisi/teyit"],
  ["ROOM_SERVICE", "RO-TES", "Teslim Takibi", "/oda-servisi/teslim"],
  ["ROOM_SERVICE", "RO-SLA", "SLA Raporları", "/admin#rs.rapor"],
  // CORE
  ["CORE", "CR-KOM", "Komuta Merkezi", "/admin"],
  ["CORE", "CR-ONL", "Online Kullanıcılar", "/admin#core.online"],
  ["CORE", "CR-RAP", "Rapor Merkezi", "/admin#core.rapor"],
  ["CORE", "CR-KUL", "Kullanıcı & Rol Yönetimi", "/admin#core.kullanici"],
  ["CORE", "CR-SYS", "Sistem Ayarları", "/admin#core.ayarlar"],
  ["CORE", "CR-DEN", "Denetim Günlüğü", "/admin#core.denetim"],
];

export const SCREENS: ScreenDef[] = CATALOG.map(([moduleKey, code, name, path], index) => ({
  code,
  moduleKey,
  name,
  path,
  group: MODULE_GROUPS[moduleKey],
  sortOrder: index + 1,
}));
