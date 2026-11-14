import type { ModuleKey, RoleKind } from "@/generated/prisma/client";
import type { ScreenDef } from "@/modules/core/screens";

export type Profile = "TAM" | "ISLET" | "SAHA" | "IZLE";

/** V view · O create · D edit · A approve · R report. */
export type Action = "V" | "O" | "D" | "A" | "R";

export interface RoleDef {
  code: string;
  name: string;
  kind: RoleKind;
  profile: Profile;
  modules: ModuleKey[] | "ALL";
  maxOnlineMinutes?: number;
  /** Code of the screen opened after login. */
  defaultScreen: string;
}

export const ROLES: RoleDef[] = [
  { code: "R-SYS", name: "Sistem Yöneticisi", kind: "SISTEM", profile: "TAM", modules: "ALL", defaultScreen: "CR-KOM" },
  { code: "R-ITT", name: "Otel IT (Destek)", kind: "SISTEM", profile: "IZLE", modules: ["CORE"], defaultScreen: "CR-SYS" },
  { code: "R-OTM", name: "Otel Yönetimi (Raporlar)", kind: "YONETIM", profile: "ISLET", modules: ["CORE", "MINIBAR", "QR_MENU", "QR_ORDER"], defaultScreen: "CR-RAP" },
  { code: "R-FBM", name: "F&B Yönetimi", kind: "YONETIM", profile: "ISLET", modules: ["CORE", "MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"], defaultScreen: "CR-KOM" },
  { code: "R-SGF", name: "Servis Süpervizyonu", kind: "OUTLET", profile: "ISLET", modules: ["QR_ORDER", "QR_MENU"], defaultScreen: "QS-KUY" },
  { code: "R-GAR", name: "Servis Personeli", kind: "OUTLET", profile: "SAHA", modules: ["QR_ORDER", "QR_MENU"], defaultScreen: "QS-KUY" },
  { code: "R-BAR", name: "Bar Personeli", kind: "OUTLET", profile: "SAHA", modules: ["QR_ORDER"], defaultScreen: "QS-KUY" },
  { code: "R-BUT", name: "VIP Servis Personeli", kind: "OUTLET", profile: "SAHA", modules: ["QR_ORDER", "ROOM_SERVICE"], defaultScreen: "QS-KUY" },
  { code: "R-OUT", name: "Çağrı Karşılama", kind: "OUTLET", profile: "SAHA", modules: ["QR_MENU"], defaultScreen: "QM-CAG" },
  { code: "R-ODS", name: "Oda Servisi Personeli", kind: "OUTLET", profile: "SAHA", modules: ["ROOM_SERVICE"], defaultScreen: "RO-TAL" },
  { code: "R-KAS", name: "Kasa", kind: "OUTLET", profile: "ISLET", modules: ["QR_ORDER", "QR_MENU"], defaultScreen: "QS-KAS" },
  { code: "R-MUS", name: "Mutfak Süpervizyonu", kind: "MUTFAK", profile: "ISLET", modules: ["QR_ORDER", "ROOM_SERVICE"], defaultScreen: "QS-KDS" },
  { code: "R-MUP", name: "Mutfak Personeli", kind: "MUTFAK", profile: "SAHA", modules: ["QR_ORDER"], defaultScreen: "QS-KDS" },
  { code: "R-KDS", name: "Mutfak Ekranı (KDS)", kind: "MUTFAK", profile: "SAHA", modules: ["QR_ORDER"], defaultScreen: "QS-KDS" },
  { code: "R-KAT", name: "Minibar Kat Personeli", kind: "MINIBAR", profile: "SAHA", modules: ["MINIBAR"], maxOnlineMinutes: 600, defaultScreen: "MB-KAT" },
  { code: "R-DEP", name: "Minibar Depo", kind: "MINIBAR", profile: "ISLET", modules: ["MINIBAR"], defaultScreen: "MB-ZIM" },
  { code: "R-HKS", name: "Minibar İzleme", kind: "MINIBAR", profile: "IZLE", modules: ["MINIBAR"], defaultScreen: "MB-RAP" },
  // Yönetici yardımcıları (10 Kas 2026): R-SYS'in devrettiği dar yetkiler. R-MTY / R-QMY yönetim masaüstünü kullanır
  // (YONETIM: yalnız SISTEM atar), çekirdek ekranlarda yalnız CR-KOM ve CR-RAP alır (DELEGATE_MANAGERS).
  { code: "R-MTY", name: "Minibar Yönetimi", kind: "YONETIM", profile: "IZLE", modules: ["CORE", "MINIBAR"], defaultScreen: "CR-KOM" },
  { code: "R-QMY", name: "QR Menü Yönetimi", kind: "YONETIM", profile: "ISLET", modules: ["CORE", "QR_MENU"], defaultScreen: "CR-KOM" },
  { code: "R-OUY", name: "Outlet İzleme", kind: "OUTLET", profile: "IZLE", modules: ["QR_ORDER"], defaultScreen: "QS-KAS" },
  { code: "R-MUY", name: "Mutfak İzleme", kind: "MUTFAK", profile: "IZLE", modules: ["QR_ORDER"], defaultScreen: "QS-KDS" },
  // Kademe (12 Kas 2026): F&B Müdürü > F&B Müdür Yardımcısı > Oda Servisi Sorumlusu > saha rolleri. Kimin kimi
  // yönettiği roleRanks.ts'te; ekran hakları burada. R-FBY, R-FBM'nin haklarını taşır. R-OSS minibar takibinin ve
  // oda servisinin tamamını yürütür: bir minibar garsonunun (R-KAT) ya da oda servisi personelinin (R-ODS)
  // yapabildiği her şeyi yapar ve onaylar, kendi ekibinin kullanıcılarını tanımlar (CR-KUL).
  { code: "R-FBY", name: "F&B Müdür Yardımcısı", kind: "YONETIM", profile: "ISLET", modules: ["CORE", "MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"], defaultScreen: "CR-KOM" },
  { code: "R-OSS", name: "Oda Servisi Sorumlusu", kind: "YONETIM", profile: "ISLET", modules: ["CORE", "MINIBAR", "ROOM_SERVICE"], defaultScreen: "CR-KOM" },
];

export const PROFILE_ACTIONS: Record<Profile, readonly Action[]> = {
  TAM: ["V", "O", "D", "A", "R"],
  ISLET: ["V", "O", "D", "A"],
  SAHA: ["V", "O", "D"],
  IZLE: ["V", "R"],
};

const VIEW_REPORT: readonly Action[] = ["V", "R"];

/** CORE screens every role may open for reporting. */
const CORE_ALL_ROLES = new Set(["CR-RAP"]);
/** Command center and live radar: view + report for system and management roles only. */
const CORE_MANAGEMENT = new Set(["CR-KOM", "CR-RAD", "CR-DUR"]);
/** Online users: hotel managers may also force-logout (A). R-SYS already has A via profile TAM. */
const ONLINE_FORCE: readonly Action[] = ["V", "A", "R"];
/**
 * Definition screens (Tanımlamalar, Kurulum Rehberi): R-SYS has everything (module "ALL"), the
 * support role only views, management roles may view, create and edit; nobody else has a row.
 */
const CORE_DEFINITIONS = new Set(["CR-TAN", "CR-REH"]);
const DEFINITIONS_VIEW_ONLY: readonly Action[] = ["V"];
const DEFINITIONS_MANAGE: readonly Action[] = ["V", "O", "D"];
/** Remaining CORE screens (user/role admin, settings) belong to these roles only. */
const CORE_ADMIN_ROLES = new Set(["R-SYS", "R-ITT"]);
/**
 * YONETIM-kind delegate roles: the desktop needs CR-KOM view, every role has CR-RAP; none of the other
 * management CORE rights (definitions, users, online users, audit log, radar) — they manage nothing outside
 * their own module screens.
 */
const DELEGATE_MANAGERS = new Set(["R-MTY", "R-QMY"]);
const DELEGATE_CORE = new Set(["CR-KOM", "CR-RAP", "CR-DUR"]);
/**
 * Oda Servisi Sorumlusu: a department head, not a hotel manager. Desktop, reports and the live radar to
 * watch the operation, user management for its own team (the roles it may assign are in roleRanks.ts);
 * no definitions, online users, audit log or system settings.
 */
const DEPARTMENT_HEADS = new Set(["R-OSS"]);
const DEPARTMENT_CORE_VIEW = new Set(["CR-KOM", "CR-RAP", "CR-RAD", "CR-DUR"]);

/**
 * One list of screen limits applied to module screens (never CORE, never `modules: "ALL"` roles). Each entry
 * names the plan that introduced it and which roles it matches; `keep` maps a screen code to the actions that
 * survive (intersection with the profile actions, `[]` = no row at all). Entries apply in order.
 *
 * Migrations repeat the new entries for databases seeded earlier: 0005 (P5), 20261102214000 (R-KAT),
 * 20261103093000 (P2/P3, the `@limits` block), 20261107090000 (P7 `grant`, its `@limits` block) and 20261110140100
 * (D2: R-DEP MB-ZIM A, R-KAT MB-TAL D, its `@limits` block); 20261110160000 creates the four YR roles with
 * their whole global matrix (its `@limits` block). `match.exceptCodes` selects every role except those listed.
 */
export type ScreenLimit = {
  plan: "P5" | "P2" | "P3" | "P7" | "YR" | "KD";
  match?: {
    kind?: RoleKind;
    profile?: Profile;
    codes?: readonly string[];
    exceptCodes?: readonly string[];
  };
  keep?: Record<string, readonly Action[]>;
  /** Actions added on top of the earlier entries' result (only for screens the role's modules already open). */
  grant?: Record<string, readonly Action[]>;
};

/** P5: field staff of an outlet and kitchen roles see less, the A action on QS-KUY / QS-IPT is role-bound. */
const P5_APPROVERS = ["R-SYS", "R-OTM", "R-FBM", "R-FBY", "R-SGF", "R-KAS", "R-GAR"] as const;

export const SCREEN_LIMITS: ScreenLimit[] = [
  {
    plan: "P5",
    match: { kind: "OUTLET", profile: "SAHA" },
    keep: {
      "QM-MEN": ["V"],
      "QM-TEM": ["V"],
      "QM-RAP": [],
      "QS-RAP": [],
      "QS-KAS": [],
      "QS-FIS": [],
      "QS-IPT": [],
      "QS-KDS": ["V"],
    },
  },
  {
    plan: "P5",
    match: { kind: "MUTFAK" },
    keep: {
      "QS-KAS": [],
      "QS-FIS": [],
      "QS-IPT": [],
      "QM-MEN": [],
      "QM-TEM": [],
      "QM-RAP": [],
      "QS-KUY": ["V"],
    },
  },
  {
    plan: "P5",
    match: { exceptCodes: P5_APPROVERS },
    keep: { "QS-KUY": ["V", "O", "D", "R"], "QS-IPT": ["V", "O", "D", "R"] },
  },
  // P2: definitions and hotel warehouse stock (Otel Deposu).
  { plan: "P2", match: { codes: ["R-OTM"] }, keep: { "MB-TAN": ["V", "O", "D"], "MB-ZIM": ["V"] } },
  // D2 (10 Kas 2026): the warehouse corrects counts on the pool (MB-ZIM A); see pool.countPool.
  { plan: "P2", match: { codes: ["R-DEP"] }, keep: { "MB-TAN": ["V"], "MB-ZIM": ["V", "O", "D", "A"] } },
  { plan: "P2", match: { codes: ["R-HKS"] }, keep: { "MB-TAN": ["V"], "MB-ZIM": ["V", "R"] } },
  { plan: "P2", match: { codes: ["R-KAT"] }, keep: { "MB-TAN": [], "MB-ZIM": ["V", "D"] } },
  // P3: floor operation, requests, occupancy upload, DND.
  {
    plan: "P3",
    match: { codes: ["R-KAT"] },
    keep: {
      "MB-KAT": ["V"],
      "MB-KF": ["V"],
      "MB-TUK": ["V", "O", "D"],
      "MB-ZIM": ["V", "D"],
      // D (D2, 10 Kas 2026): correction requests of past-dated records (roomCheckService.createCorrectionRequest).
      // The warehouse steps also need A, so this does not make the floor role a warehouse operator.
      "MB-TAL": ["V", "O", "D"],
      "MB-DND": ["V"],
      "MB-DOL": [],
    },
  },
  {
    plan: "P3",
    match: { codes: ["R-DEP"] },
    keep: {
      "MB-KAT": ["V"],
      "MB-KF": [],
      "MB-TUK": ["V"],
      "MB-ZIM": ["V", "O", "D", "A"],
      "MB-TAL": ["V", "D", "A"],
      "MB-DOL": ["V", "O", "D"],
      "MB-DND": ["V"],
    },
  },
  { plan: "P3", match: { codes: ["R-OTM"] }, keep: { "MB-KF": [], "MB-TUK": ["V"] } },
  // P7: the ISLET profile has no R, so these managers could not open the reports of their own modules.
  // `grant` runs after every `keep` above; none of P5/P2/P3 restricts R on these role × screen pairs.
  { plan: "P7", match: { codes: ["R-OTM"] }, grant: { "MB-RAP": ["R"], "QM-RAP": ["R"], "QS-RAP": ["R"] } },
  { plan: "P7", match: { codes: ["R-FBM"] }, grant: { "QM-RAP": ["R"], "QS-RAP": ["R"], "RO-SLA": ["R"] } },
  { plan: "P7", match: { codes: ["R-DEP"] }, grant: { "MB-RAP": ["R"] } },
  { plan: "P7", match: { codes: ["R-SGF"] }, grant: { "QM-RAP": ["R"], "QS-RAP": ["R"] } },
  // YR (10 Kas 2026) — yönetici yardımcıları. Minibar Takip Yöneticisi: R-DEP / R-KAT minibar ekranlarında yalnız
  // görüntüleme, raporlarda V,R; doluluk dosyası yükler (MB-DOL O = previewOccupancy / commitOccupancy, R-DEP ile
  // aynı eylem) ve yüklemeyi siler / geri alır, görevleri yeniden üretir (MB-DOL D). Elle oda girişi ayarı ekran
  // matrisinde değil, manualRoomEntryAdmin.MANUAL_ENTRY_EDITOR_ROLES ile açılır.
  {
    plan: "YR",
    match: { codes: ["R-MTY"] },
    keep: {
      "MB-KAT": ["V"],
      "MB-KF": ["V"],
      "MB-TUK": ["V"],
      "MB-ZIM": ["V"],
      "MB-TAL": ["V"],
      "MB-DOL": ["V"],
      "MB-PERS": ["V"],
      "MB-DND": ["V"],
      "MB-RAP": ["V", "R"],
      "MB-TAN": ["V"],
    },
    // Otel deposu (12 Kas 2026): merkez depo teslimini otellere dağıtır, başlangıç stoğunu düzeltir (receipts.ts).
    // Tanımlar (12 Kas 2026): ürün grubu, ürün, setup ve setup içeriği ekler, düzenler, pasife alır (silme R-SYS'te).
    // MyBar (13 Kas 2026): talebi onaylar ("Gördüm") ve tamamlar (MB-PERS D); iptal (A) yok.
    grant: { "MB-DOL": ["O", "D"], "MB-ZIM": ["O", "D"], "MB-TAN": ["O", "D"], "MB-PERS": ["D"] },
  },
  // QR Menü Yöneticisi (varsayım: ürün sahibi ayrıntı vermedi): menü ağacı / çeviri / masa QR'ları (QM-MEN) ve
  // outlet tasarımı (QM-TEM) V,O,D; menü raporları V,R; garson çağrıları (QM-CAG) ve QR_ORDER yok.
  {
    plan: "YR",
    match: { codes: ["R-QMY"] },
    keep: { "QM-MIS": ["V"], "QM-CAG": [], "QM-MEN": ["V", "O", "D"], "QM-TEM": ["V", "O", "D"], "QM-RAP": ["V"] },
    grant: { "QM-RAP": ["R"] },
  },
  // Outlet Yöneticisi: atandığı outlet'lerde (OutletMember) kasa ekranı ve sipariş raporları V,R; yazma yok.
  {
    plan: "YR",
    match: { codes: ["R-OUY"] },
    keep: { "QS-KUY": [], "QS-KAS": ["V", "R"], "QS-KDS": [], "QS-FIS": [], "QS-IPT": [], "QS-RAP": ["V", "R"] },
  },
  // Mutfak Yöneticisi: yalnız KDS görüntüleme.
  {
    plan: "YR",
    match: { codes: ["R-MUY"] },
    keep: { "QS-KUY": [], "QS-KAS": [], "QS-KDS": ["V"], "QS-FIS": [], "QS-IPT": [], "QS-RAP": [] },
  },
  // KD (12 Kas 2026) — kademe. ISLET profilinde R yok: F&B Müdürü ve yardımcısı kendi modüllerinin bütün
  // raporlarını, Oda Servisi Sorumlusu minibar ve oda servisi raporlarını tam alır. Migration 20261112150000.
  {
    plan: "KD",
    match: { codes: ["R-FBM", "R-FBY"] },
    grant: { "MB-RAP": ["R"], "QM-RAP": ["R"], "QS-RAP": ["R"], "RO-SLA": ["R"] },
  },
  { plan: "KD", match: { codes: ["R-OSS"] }, grant: { "MB-RAP": ["R"], "RO-SLA": ["R"] } },
];

const ACTION_ORDER: readonly Action[] = ["V", "O", "D", "A", "R"];

function matches(role: RoleDef, m: ScreenLimit["match"]): boolean {
  if (!m) return true;
  if (m.kind && role.kind !== m.kind) return false;
  if (m.profile && role.profile !== m.profile) return false;
  if (m.codes && !m.codes.includes(role.code)) return false;
  if (m.exceptCodes && m.exceptCodes.includes(role.code)) return false;
  return true;
}

function applyScreenLimits(role: RoleDef, screen: ScreenDef, actions: readonly Action[]): readonly Action[] {
  let result = actions;
  for (const limit of SCREEN_LIMITS) {
    const keep = limit.keep?.[screen.code];
    if (keep && matches(role, limit.match)) result = result.filter((a) => keep.includes(a));
    const grant = limit.grant?.[screen.code];
    if (grant && matches(role, limit.match)) {
      result = ACTION_ORDER.filter((a) => result.includes(a) || grant.includes(a));
    }
  }
  return result;
}

/** Concrete module list of a role; 'ALL' expands to every non-core module. */
export function roleModules(role: RoleDef, allModules: readonly ModuleKey[]): ModuleKey[] {
  return role.modules === "ALL" ? allModules.filter((m) => m !== "CORE") : role.modules;
}

/**
 * Actions a role is granted on a screen (empty when it has no access at all).
 * Module screens follow the role's profile; CORE screens follow the dedicated rules above,
 * even for roles that list CORE among their modules.
 */
export function actionsFor(role: RoleDef, screen: ScreenDef): readonly Action[] {
  if (role.modules === "ALL") return PROFILE_ACTIONS[role.profile];

  if (screen.moduleKey === "CORE") {
    if (CORE_ALL_ROLES.has(screen.code)) return VIEW_REPORT;
    if (DELEGATE_MANAGERS.has(role.code)) {
      // Minibar Yönetimi also watches the radar; the server limits it to the minibar layer (radar/server/scope.ts).
      if (role.code === "R-MTY" && screen.code === "CR-RAD") return VIEW_REPORT;
      return DELEGATE_CORE.has(screen.code) ? VIEW_REPORT : [];
    }
    if (DEPARTMENT_HEADS.has(role.code)) {
      if (DEPARTMENT_CORE_VIEW.has(screen.code)) return VIEW_REPORT;
      return screen.code === "CR-KUL" ? DEFINITIONS_MANAGE : [];
    }
    if (CORE_DEFINITIONS.has(screen.code)) {
      if (role.code === "R-ITT") return DEFINITIONS_VIEW_ONLY;
      return role.kind === "YONETIM" ? DEFINITIONS_MANAGE : [];
    }
    // CR-KUL (users/teams): hotel managers also get V,O,D; roles and permission edits stay SISTEM-only in the services.
    if (screen.code === "CR-KUL" && role.kind === "YONETIM") return DEFINITIONS_MANAGE;
    if (screen.code === "CR-ONL") {
      if (role.kind === "YONETIM") return ONLINE_FORCE;
      if (role.kind === "SISTEM") return VIEW_REPORT;
      return [];
    }
    // Audit log is read-only. Managers see their hotels in the service; R-SYS is TAM via modules ALL.
    if (screen.code === "CR-DEN") {
      if (role.kind === "YONETIM" || role.kind === "SISTEM") return VIEW_REPORT;
      return [];
    }
    if (CORE_MANAGEMENT.has(screen.code)) {
      return role.kind === "SISTEM" || role.kind === "YONETIM" ? VIEW_REPORT : [];
    }
    return CORE_ADMIN_ROLES.has(role.code) ? PROFILE_ACTIONS[role.profile] : [];
  }

  if (!role.modules.includes(screen.moduleKey)) return [];
  return applyScreenLimits(role, screen, PROFILE_ACTIONS[role.profile]);
}
