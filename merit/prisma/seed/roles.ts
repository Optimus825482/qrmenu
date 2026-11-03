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
  { code: "R-OTM", name: "Otel Müdürü", kind: "YONETIM", profile: "ISLET", modules: ["CORE", "MINIBAR", "QR_MENU", "QR_ORDER"], defaultScreen: "CR-RAP" },
  { code: "R-FBM", name: "F&B Müdürü", kind: "YONETIM", profile: "ISLET", modules: ["CORE", "MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"], defaultScreen: "CR-KOM" },
  { code: "R-SGF", name: "Şef Garson / Süpervizör", kind: "OUTLET", profile: "ISLET", modules: ["QR_ORDER", "QR_MENU"], defaultScreen: "QS-KUY" },
  { code: "R-GAR", name: "Garson", kind: "OUTLET", profile: "SAHA", modules: ["QR_ORDER", "QR_MENU"], defaultScreen: "QS-KUY" },
  { code: "R-BAR", name: "Barmen", kind: "OUTLET", profile: "SAHA", modules: ["QR_ORDER"], defaultScreen: "QS-KUY" },
  { code: "R-BUT", name: "Butler (VIP)", kind: "OUTLET", profile: "SAHA", modules: ["QR_ORDER", "ROOM_SERVICE"], defaultScreen: "QS-KUY" },
  { code: "R-OUT", name: "Outlet Görevlisi", kind: "OUTLET", profile: "SAHA", modules: ["QR_MENU"], defaultScreen: "QM-CAG" },
  { code: "R-ODS", name: "Oda Servisi Görevlisi", kind: "OUTLET", profile: "SAHA", modules: ["ROOM_SERVICE"], defaultScreen: "RO-TAL" },
  { code: "R-KAS", name: "Kasa", kind: "OUTLET", profile: "ISLET", modules: ["QR_ORDER", "QR_MENU"], defaultScreen: "QS-KAS" },
  { code: "R-MUS", name: "Mutfak Şefi", kind: "MUTFAK", profile: "ISLET", modules: ["QR_ORDER", "ROOM_SERVICE"], defaultScreen: "QS-KDS" },
  { code: "R-MUP", name: "Mutfak Personeli", kind: "MUTFAK", profile: "SAHA", modules: ["QR_ORDER"], defaultScreen: "QS-KDS" },
  { code: "R-KDS", name: "KDS Operatörü", kind: "MUTFAK", profile: "SAHA", modules: ["QR_ORDER"], defaultScreen: "QS-KDS" },
  { code: "R-KAT", name: "Kat Sorumlusu", kind: "MINIBAR", profile: "SAHA", modules: ["MINIBAR"], maxOnlineMinutes: 600, defaultScreen: "MB-KAT" },
  { code: "R-DEP", name: "Depo Sorumlusu", kind: "MINIBAR", profile: "ISLET", modules: ["MINIBAR"], defaultScreen: "MB-ZIM" },
  { code: "R-HKS", name: "Housekeeping Süpervizörü", kind: "MINIBAR", profile: "IZLE", modules: ["MINIBAR"], defaultScreen: "MB-RAP" },
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
/** Command center: view + report for system and management roles only. */
const CORE_MANAGEMENT = new Set(["CR-KOM"]);
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
 * One list of screen limits applied to module screens (never CORE, never `modules: "ALL"` roles). Each entry
 * names the plan that introduced it and which roles it matches; `keep` maps a screen code to the actions that
 * survive (intersection with the profile actions, `[]` = no row at all). Entries apply in order.
 *
 * Migrations repeat the new entries for databases seeded earlier: 0005 (P5), 20261102214000 (R-KAT) and
 * 20261103093000 (P2/P3, the `@limits` block). `match.exceptCodes` selects every role except those listed.
 */
export type ScreenLimit = {
  plan: "P5" | "P2" | "P3" | "P7";
  match?: {
    kind?: RoleKind;
    profile?: Profile;
    codes?: readonly string[];
    exceptCodes?: readonly string[];
  };
  keep?: Record<string, readonly Action[]>;
};

/** P5: field staff of an outlet and kitchen roles see less, the A action on QS-KUY / QS-IPT is role-bound. */
const P5_APPROVERS = ["R-SYS", "R-OTM", "R-FBM", "R-SGF", "R-KAS", "R-GAR"] as const;

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
  // P2: definitions and pool (Zimmet Havuzu).
  { plan: "P2", match: { codes: ["R-OTM"] }, keep: { "MB-TAN": ["V", "O", "D"], "MB-ZIM": ["V"] } },
  { plan: "P2", match: { codes: ["R-DEP"] }, keep: { "MB-TAN": ["V"], "MB-ZIM": ["V", "O", "D"] } },
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
      "MB-TAL": ["V", "O"],
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
      "MB-ZIM": ["V", "O", "D"],
      "MB-TAL": ["V", "D", "A"],
      "MB-DOL": ["V", "O", "D"],
      "MB-DND": ["V"],
    },
  },
  { plan: "P3", match: { codes: ["R-OTM"] }, keep: { "MB-KF": [], "MB-TUK": ["V"] } },
];

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
