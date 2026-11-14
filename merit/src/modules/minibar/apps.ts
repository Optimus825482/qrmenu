import { registerCatalogApp } from "@/shell/registry";

/**
 * Registrations of the Minibar tracking module's apps (MINIBAR category).
 * Makes all Minibar screens accessible directly on the Merit OS System Administrator desktop & Start Menu.
 */
export function registerMinibarApps(): void {
  registerCatalogApp({
    id: "minibar.kat",
    title: "Kat Planı",
    launchLabel: "Kat Planı",
    icon: "minibar",
    moduleKey: "MINIBAR",
    screenCode: "MB-KAT",
    category: "MINIBAR",
    needsHotel: true,
    window: { w: 1280, h: 800, minW: 800, minH: 550 },
    kind: "iframe",
    url: "/kat",
    mobile: "full",
  });

  registerCatalogApp({
    id: "minibar.rota",
    title: "Akıllı Tavsiye İş Planı",
    launchLabel: "Akıllı Tavsiye İş Planı",
    icon: "komuta",
    moduleKey: "MINIBAR",
    screenCode: "MB-KAT",
    purpose: "Bugün kontrol edilecek odalar için önerilen sırayı ve iş planını görürsün.",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1180, h: 780, minW: 800, minH: 500 },
    kind: "iframe",
    url: "/kat/tavsiye-is-plani",
    mobile: "full",
  });

  registerCatalogApp({
    id: "minibar.doluluk",
    title: "Doluluk Yükleme",
    launchLabel: "Doluluk Yükleme",
    icon: "pencere",
    moduleKey: "MINIBAR",
    screenCode: "MB-DOL",
    category: "MINIBAR",
    needsHotel: true,
    window: { w: 1100, h: 750, minW: 760, minH: 500 },
    kind: "iframe",
    url: "/depo/doluluk-yukle",
    mobile: "readonly",
  });

  registerCatalogApp({
    id: "minibar.stok",
    title: "Otel Deposu",
    launchLabel: "Otel Deposu",
    icon: "otel",
    moduleKey: "MINIBAR",
    screenCode: "MB-ZIM",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1150, h: 750, minW: 760, minH: 500 },
    kind: "iframe",
    url: "/depo/stok",
    mobile: "full",
  });

  registerCatalogApp({
    id: "minibar.tedarik",
    title: "Merkez Depo Tedarik",
    launchLabel: "Merkez Depo Tedarik",
    icon: "otel",
    moduleKey: "MINIBAR",
    screenCode: "MB-ZIM",
    purpose: "Merkez depodan gelen ürünleri otel deposuna tedarik olarak kaydedersin.",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1150, h: 780, minW: 760, minH: 500 },
    kind: "iframe",
    url: "/depo/tedarik",
    mobile: "full",
  });

  registerCatalogApp({
    id: "minibar.rapor",
    title: "Minibar Raporları",
    launchLabel: "Minibar Raporları",
    icon: "denetim",
    moduleKey: "MINIBAR",
    screenCode: "MB-RAP",
    category: "MINIBAR",
    needsHotel: true,
    window: { w: 1200, h: 800, minW: 800, minH: 520 },
    kind: "iframe",
    url: "/depo/raporlar",
    mobile: "readonly",
  });

  registerCatalogApp({
    id: "minibar.tanim",
    title: "Minibar Tanımları",
    launchLabel: "Minibar Tanımları",
    icon: "ayarlar",
    moduleKey: "MINIBAR",
    screenCode: "MB-TAN",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1300, h: 850, minW: 850, minH: 550 },
    kind: "iframe",
    url: "/depo/tanimlar",
    mobile: "none",
  });

  registerCatalogApp({
    id: "minibar.odaqr",
    title: "Oda QR Kodları & Baskı",
    launchLabel: "Oda QR Kodları & Baskı",
    icon: "qr",
    moduleKey: "MINIBAR",
    screenCode: "MB-TAN",
    purpose: "Oda QR kodlarını görüntüler ve baskıya hazırlarsın.",
    category: "MINIBAR",
    needsHotel: true,
    window: { w: 980, h: 620, minW: 720, minH: 450 },
    kind: "component",
    component: () =>
      import("@/modules/minibar/ui/RoomQrWindow").then((m) => ({
        default: m.RoomQrWindow,
      })),
    mobile: "none",
  });

  // The user's own room check records: a manager who does room checks (R-OSS) has no floor navigation, so the
  // list (with the same-day cancel / cancellation request) is a window of its own. Server: roomCheckService.
  registerCatalogApp({
    id: "minibar.islemlerim",
    title: "İşlemlerim",
    launchLabel: "İşlemlerim",
    icon: "denetim",
    moduleKey: "MINIBAR",
    screenCode: "MB-TUK",
    purpose: "Yaptığın oda kontrol kayıtlarını odaya göre görür, bugünkünü iptal eder, geçmiş için iptal talebi gönderirsin.",
    roleCodes: ["R-MTY", "R-OSS", "R-FBY", "R-FBM"],
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1000, h: 760, minW: 640, minH: 480 },
    kind: "iframe",
    url: "/kat/islemlerim",
    mobile: "full",
  });

  // Requests of the floor team that wait for a decision: corrections / deletions, manual entries, extra stock.
  // The server decides who may resolve them (roomCheckService.resolveCorrectionRequest, manualEntryRequests).
  registerCatalogApp({
    id: "minibar.onaylar",
    title: "Bekleyen Talepler ve Onaylar",
    launchLabel: "Bekleyen Talepler ve Onaylar",
    icon: "denetim",
    moduleKey: "MINIBAR",
    screenCode: "MB-TAL",
    purpose: "Minibar garsonlarından gelen düzeltme, manuel kayıt ve ek stok taleplerini görür, yanıtlarsın.",
    roleCodes: ["R-MTY", "R-OSS", "R-FBY", "R-FBM", "R-SYS"],
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1150, h: 760, minW: 760, minH: 500 },
    kind: "iframe",
    url: "/kat/duzeltme-onay",
    mobile: "full",
  });

  // Minibar Takip Yöneticisi: the manual room entry switch without Denetim Masası (no CR-SYS). R-SYS keeps it
  // in Denetim Masası → Minibar ve Kat. The server re-checks the role and the hotel (manualRoomEntryAdmin).
  registerCatalogApp({
    id: "minibar.elle-giris",
    title: "Elle Oda Girişi",
    launchLabel: "Elle Oda Girişi",
    icon: "ayarlar",
    moduleKey: "MINIBAR",
    screenCode: "MB-TUK",
    purpose: "QR okutmadan, oda numarası yazılarak hangi kat ve odalarda oda kontrolü açılabileceğini belirlersin.",
    roleCodes: ["R-MTY", "R-OSS", "R-FBY", "R-FBM"],
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 720, h: 560, minW: 520, minH: 400 },
    kind: "component",
    component: () =>
      import("@/shell/apps/ManualRoomEntryWindow").then((m) => ({ default: m.ManualRoomEntryWindow })),
    mobile: "none",
  });

  // Minibar Yönetimi: the minibar staff of the manager's own hotels (list, add garson, edit, reset password,
  // activate/deactivate) without CR-KUL. The server re-checks role, target role and shared hotel (minibarUsers).
  registerCatalogApp({
    id: "minibar.kullanicilar",
    title: "Minibar Kullanıcıları",
    launchLabel: "Minibar Kullanıcıları",
    icon: "kullanicilar",
    moduleKey: "MINIBAR",
    screenCode: "MB-TUK",
    purpose: "Minibar kullanıcılarını listeler, bilgilerini günceller, şifre sıfırlar ve yeni garson eklersin.",
    roleCodes: ["R-MTY", "R-OSS", "R-FBY", "R-FBM", "R-SYS"],
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 980, h: 600, minW: 640, minH: 420 },
    kind: "component",
    component: () =>
      import("@/shell/apps/MinibarUsersWindow").then((m) => ({ default: m.MinibarUsersWindow })),
    mobile: "none",
  });

  // The room check records of ALL staff for a manager: edit and delete of any day (MB-OKI V / D). Lists every hotel
  // of the user's scope where the screen is granted, or the one the banner picks. Server: roomCheckAdminService.
  registerCatalogApp({
    id: "minibar.odakontrol",
    title: "Oda Kontrol İşlemleri",
    launchLabel: "Oda Kontrol İşlemleri",
    icon: "denetim",
    moduleKey: "MINIBAR",
    screenCode: "MB-OKI",
    purpose: "Bütün personelin oda kontrol kayıtlarını gün ve personele göre görür, düzeltir veya silersin.",
    category: "MINIBAR",
    needsHotel: false,
    window: { w: 1180, h: 780, minW: 760, minH: 500 },
    kind: "iframe",
    url: "/kat/oda-kontrol-islemleri",
    mobile: "full",
  });
}
