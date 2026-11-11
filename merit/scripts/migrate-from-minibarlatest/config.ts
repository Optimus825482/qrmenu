export const STEP_NAMES = ["definitions", "users", "history", "tasks"] as const;
export type StepName = (typeof STEP_NAMES)[number];

export const HOTEL_CODES = ["DIAMOND", "ROYAL", "PREMIUM"] as const;
export type HotelCode = (typeof HOTEL_CODES)[number];

/** Operator/config mistake: the CLI exits with code 2 and nothing is written. The message never contains a connection string. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface MigrationConfig {
  legacyUrl: string;
  targetUrl: string;
  legacySchema: string;
  dryRun: boolean;
  only: StepName[] | null;
  skip: StepName[];
  skipLogs: boolean;
  hotelMap: Record<string, HotelCode>;
  actor: string | null;
  /** Legacy `kullanicilar.rol` values that become users (lower case); null = every known role. */
  userRoles: string[] | null;
  /** The target catalogue is already the current one: legacy setup contents / room-type links are not written, legacy-only products and setups arrive inactive. */
  frozenCatalog: boolean;
  /**
   * Users created by this run follow the new system's onboarding rules instead of keeping their legacy login:
   * user name from the full name (ad.soyad), the standard temporary password, and a forced change at first login.
   */
  newCredentials: boolean;
  /** Legacy user names (lower case) that are never migrated, whatever their role (test accounts). */
  skipUsers: string[];
  reportPath: string;
  batch: number;
  notificationsDays: number;
  mybarWindowMin: number;
  /** Where hotel logos are written (only when the file is missing). */
  logoDir: string;
}

const VALUE_FLAGS = new Set([
  "--only",
  "--skip",
  "--hotel-map",
  "--actor",
  "--user-roles",
  "--skip-users",
  "--report",
  "--batch",
  "--notifications-days",
  "--mybar-window-min",
  "--legacy-schema",
  "--logo-dir",
]);
const BOOL_FLAGS = new Set(["--dry-run", "--skip-logs", "--frozen-catalog", "--new-credentials"]);

function parseSteps(flag: string, raw: string): StepName[] {
  const names = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const n of names) {
    if (!(STEP_NAMES as readonly string[]).includes(n)) {
      throw new ConfigError(`${flag}: bilinmeyen adım "${n}" (geçerli: ${STEP_NAMES.join(", ")})`);
    }
  }
  return STEP_NAMES.filter((s) => names.includes(s));
}

function parseUserRoles(raw: string): string[] {
  const roles = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (roles.length === 0 || roles.some((r) => !/^[a-z_]+$/.test(r))) {
    throw new ConfigError("--user-roles: eski rol adları bekleniyor (örnek: depo_sorumlusu)");
  }
  return roles;
}

function parseInt0(flag: string, raw: string, min: number, max: number): number {
  if (!/^\d+$/.test(raw)) throw new ConfigError(`${flag}: sayı bekleniyor`);
  const n = Number(raw);
  if (n < min || n > max) throw new ConfigError(`${flag}: ${min}..${max} aralığında olmalı`);
  return n;
}

export function parseConfig(argv: string[], env: Record<string, string | undefined>): MigrationConfig {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let inline: string | undefined;
    const eq = arg.indexOf("=");
    if (arg.startsWith("--") && eq > 0) {
      inline = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    if (BOOL_FLAGS.has(arg)) {
      flags.add(arg);
    } else if (VALUE_FLAGS.has(arg)) {
      const v = inline ?? argv[++i];
      if (v === undefined || v.startsWith("--")) throw new ConfigError(`${arg}: değer gerekli`);
      values.set(arg, v);
    } else {
      throw new ConfigError(`Bilinmeyen bayrak: ${arg}`);
    }
  }

  const legacyUrl = env.LEGACY_DATABASE_URL?.trim();
  if (!legacyUrl) throw new ConfigError("LEGACY_DATABASE_URL ortam değişkeni gerekli");
  const targetUrl = env.DATABASE_URL?.trim();
  if (!targetUrl) throw new ConfigError("DATABASE_URL ortam değişkeni gerekli");

  const legacySchema = values.get("--legacy-schema") ?? env.LEGACY_SCHEMA?.trim() ?? "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(legacySchema)) throw new ConfigError("--legacy-schema: geçersiz şema adı");
  if (legacyUrl === targetUrl && legacySchema === "public") {
    throw new ConfigError("Legacy ve hedef aynı şemada olamaz");
  }

  const hotelMap: Record<string, HotelCode> = {};
  const rawMap = values.get("--hotel-map");
  if (rawMap) {
    for (const pair of rawMap.split(",").filter(Boolean)) {
      const [id, code] = pair.split("=").map((s) => s?.trim());
      if (!id || !/^\d+$/.test(id) || !code || !(HOTEL_CODES as readonly string[]).includes(code)) {
        throw new ConfigError(`--hotel-map: geçersiz eşleme "${pair}" (örnek: 1=DIAMOND,2=ROYAL,3=PREMIUM)`);
      }
      hotelMap[id] = code as HotelCode;
    }
  }

  return {
    legacyUrl,
    targetUrl,
    legacySchema,
    dryRun: flags.has("--dry-run"),
    only: values.has("--only") ? parseSteps("--only", values.get("--only")!) : null,
    skip: values.has("--skip") ? parseSteps("--skip", values.get("--skip")!) : [],
    skipLogs: flags.has("--skip-logs"),
    frozenCatalog: flags.has("--frozen-catalog"),
    newCredentials: flags.has("--new-credentials"),
    skipUsers: (values.get("--skip-users") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    hotelMap,
    actor: values.get("--actor") ?? null,
    userRoles: values.has("--user-roles") ? parseUserRoles(values.get("--user-roles")!) : null,
    reportPath: values.get("--report") ?? "./migration-report.md",
    batch: values.has("--batch") ? parseInt0("--batch", values.get("--batch")!, 1, 5000) : 500,
    notificationsDays: values.has("--notifications-days")
      ? parseInt0("--notifications-days", values.get("--notifications-days")!, 0, 36500)
      : 30,
    mybarWindowMin: values.has("--mybar-window-min")
      ? parseInt0("--mybar-window-min", values.get("--mybar-window-min")!, 0, 1440)
      : 10,
    logoDir: values.get("--logo-dir") ?? "public/brand/hotels",
  };
}
