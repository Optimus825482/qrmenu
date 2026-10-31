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
  { code: "R-FBM", name: "F&B Müdürü", kind: "YONETIM", profile: "ISLET", modules: ["CORE", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"], defaultScreen: "QS-KUY" },
  { code: "R-SGF", name: "Şef Garson / Süpervizör", kind: "OUTLET", profile: "ISLET", modules: ["QR_ORDER", "QR_MENU"], defaultScreen: "QS-KUY" },
  { code: "R-GAR", name: "Garson", kind: "OUTLET", profile: "SAHA", modules: ["QR_ORDER", "QR_MENU"], defaultScreen: "QS-KUY" },
  { code: "R-BAR", name: "Barmen", kind: "OUTLET", profile: "SAHA", modules: ["QR_ORDER"], defaultScreen: "QS-KUY" },
  { code: "R-BUT", name: "Butler (VIP)", kind: "OUTLET", profile: "SAHA", modules: ["QR_ORDER", "ROOM_SERVICE"], defaultScreen: "QS-KUY" },
  { code: "R-OUT", name: "Outlet Görevlisi", kind: "OUTLET", profile: "SAHA", modules: ["QR_MENU"], defaultScreen: "QM-MIS" },
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
 * P5 limits on QR_MENU / QR_ORDER screens, applied BEFORE the profile rule (actions intersect limit).
 * A limit lists the actions a screen keeps (empty = no row at all).
 * `approve`: on these screens the A action stays only with the listed roles.
 * Migration 0005 repeats the same rules for databases seeded earlier.
 */
export const P5_SCREEN_LIMITS = {
  /** Field staff of an outlet (kind OUTLET, profile SAHA). */
  outletField: {
    "QM-MEN": ["V"],
    "QM-TEM": ["V"],
    "QM-RAP": [],
    "QS-RAP": [],
    "QS-KAS": [],
    "QS-FIS": [],
    "QS-IPT": [],
    "QS-KDS": ["V"],
  } as Record<string, readonly Action[]>,
  /** Kitchen roles (kind MUTFAK). */
  kitchen: {
    "QS-KAS": [],
    "QS-FIS": [],
    "QS-IPT": [],
    "QM-MEN": [],
    "QM-TEM": [],
    "QM-RAP": [],
    "QS-KUY": ["V"],
  } as Record<string, readonly Action[]>,
  approve: {
    screens: ["QS-KUY", "QS-IPT"] as readonly string[],
    roles: ["R-SYS", "R-OTM", "R-FBM", "R-SGF", "R-KAS"] as readonly string[],
  },
};

function applyP5Limits(role: RoleDef, screen: ScreenDef, actions: readonly Action[]): readonly Action[] {
  let result = actions;
  const byRole =
    role.kind === "OUTLET" && role.profile === "SAHA"
      ? P5_SCREEN_LIMITS.outletField
      : role.kind === "MUTFAK"
        ? P5_SCREEN_LIMITS.kitchen
        : undefined;
  const limit = byRole?.[screen.code];
  if (limit) result = result.filter((a) => limit.includes(a));
  const { screens, roles } = P5_SCREEN_LIMITS.approve;
  if (screens.includes(screen.code) && !roles.includes(role.code)) {
    result = result.filter((a) => a !== "A");
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
  return applyP5Limits(role, screen, PROFILE_ACTIONS[role.profile]);
}
