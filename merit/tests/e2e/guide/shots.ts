import type { Page } from "@playwright/test";

export type Shot = {
  id: string;
  guide: string;
  user: string;
  path: string;
  title: string;
  viewport: { width: number; height: number };
  app?: string;
  hotel?: string;
  target?: string;
  prepare?: (page: Page) => Promise<void>;
  clip?: string;
  mask?: string[];
};
const wide = { width: 1280, height: 800 };
const phone = { width: 390, height: 844 };
const shot = (guide: string, id: string, title: string, user: string, path: string, extra: Partial<Shot> = {}): Shot =>
  ({ guide, id, title, user, path, viewport: wide, ...extra });

/** Only synthetic demo accounts. Tokens are resolved from the guarded training DB at capture time. */
export const SHOTS: Shot[] = [
  shot("yonetici", "masaustu", "Merit OS masaüstü", "egitim.admin", "/admin", { target: "Yönetim" }),
  ...[
    ["rehber", "Kurulum Rehberi", "Merit Royal"],
    ["tanimlar", "Tanımlamalar", "Merit Royal"],
    ["online", "Online Kullanıcılar", "Merit Royal"],
    ["rapor", "Raporlar"],
    ["menu", "Menü Yönetimi", "Merit Royal"],
  ].map(([id, app, hotel]) => shot("yonetici", id, app, "egitim.admin", "/admin", {
    app, hotel, target: "Yönetim",
    ...(id === "menu" ? { prepare: async (page: Page) => {
      await page.getByRole("region", { name: "Menü Yönetimi · Merit Royal", exact: true }).getByRole("combobox", { name: "Outlet:" }).selectOption({ label: "Havuz Bar" });
    } } : {}),
    ...(id === "rapor" ? { prepare: async (page: Page) => {
      const win = page.getByRole("region", { name: "Raporlar", exact: true });
      await win.getByRole("navigation", { name: "Raporlar" }).getByRole("button", { name: "Minibar Tüketim Raporu", exact: true }).click();
      await win.getByRole("button", { name: "Raporu Göster" }).click();
      await win.getByTestId("rc-totals").waitFor({ state: "visible" });
    } } : {}),
  })),
  shot("yonetici", "minibar", "Minibar Tanımları", "egitim.admin", "/depo/tanimlar", { target: "Yönetim" }),
  shot("yonetici", "mobil", "Android görünümü", "egitim.admin", "/admin", { viewport: phone, target: "Yönetim" }),
  ...[
    ["katlar", "Kat Planı", "/kat"],
    ["bugun", "Bugün", "/kat/tavsiye-is-plani"],
    ["qr", "QR Okut", "/kat/qr"],
    ["stok", "Zimmet stoğu", "/kat/stok"],
    ["islemler", "İşlemlerim", "/kat/islemlerim"],
    ["mybar", "MyBar talepleri", "/kat/mybar"],
  ].map(([id, title, route]) => shot("kat-sorumlusu", id, title, "egitim.kat2", route, { viewport: phone })),
  ...[
    ["pano", "Depo panosu", "/depo"],
    ["havuz", "Zimmet Havuzu", "/depo/stok"],
    ["doluluk", "Doluluk Yükleme", "/depo/doluluk-yukle"],
    ["talepler", "Düzeltme ve Ek Talepler", "/kat/duzeltme-onay"],
    ["raporlar", "Minibar Raporları", "/depo/raporlar"],
    ["mybar", "MyBar Talepleri", "/depo/mybar"],
  ].map(([id, title, route]) => shot("depo", id, title, "egitim.depo", route)),
  ...[
    ["kuyruk", "Kuyruk", "egitim.garson1", "/garson"],
    ["masalar", "Masalarım", "egitim.garson1", "/garson?sekme=masalar"],
    ["cagrilar", "Çağrılar", "egitim.garson1", "/garson/cagrilar"],
    ["kasa", "Outlet Kasa Ekranı", "egitim.kasa", "/kasa"],
    ["yazici", "Fiş Yazıcı Kuyruğu", "egitim.kasa", "/kasa/yazici"],
    ["iptal", "İptal / Düzeltme", "egitim.kasa", "/kasa/iptal"],
  ].map(([id, title, user, route], i) => shot("garson-kasa", id, title, user, route, { viewport: i < 3 ? phone : wide, target: "Havuz Bar" })),
  shot("mutfak", "kds", "Outlet Mutfak Ekranı", "egitim.kds", "/kds", { target: "Havuz Bar", viewport: { width: 1280, height: 720 } }),
  shot("mutfak", "kds-mobil", "Mutfak ekranı telefonda", "egitim.kds", "/kds", { target: "Havuz Bar", viewport: phone }),
  ...[
    ["talepler", "Oda Servisi Talepleri", "/oda-servisi"],
    ["teyit", "Telefon Teyidi", "/oda-servisi?sekme=teyit"],
    ["teslim", "Teslim Takibi", "/oda-servisi?sekme=teslim"],
    ["mobil", "Oda servisi telefonda", "/oda-servisi"],
  ].map(([id, title, route], i) => shot("mutfak", id, title, "egitim.oda", route, { target: "Oda Servisi", viewport: i === 3 ? phone : wide })),
  ...[
    ["menu", "Misafir Menü Görünümü", "/q/{table}"],
    ["menu-en", "İngilizce menü", "/q/{table}?lang=en"],
    ["menu-ar", "Arapça menü", "/q/{table}?lang=ar"],
    ["oda", "Oda sayfası", "/q/{room}"],
    ["mybar", "MyBar", "/q/{room}/mybar"],
    ["servis", "Oda Servisi", "/q/{room}/oda-servisi"],
  ].map(([id, title, route]) => shot("misafir", id, title, "", route, { viewport: phone })),
];
