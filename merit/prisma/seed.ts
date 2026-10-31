import "dotenv/config";
import path from "node:path";
import bcrypt from "bcryptjs";
import { type PrismaClient } from "@/generated/prisma/client";
import { SCREENS } from "@/modules/core/screens";
import { HOTEL_MODULES, HOTELS, ROOM_SERVICE_OUTLET } from "./seed/hotels";
import { ROLES, actionsFor, roleModules } from "./seed/roles";
import { DEFAULT_SETTINGS } from "../src/lib/settings-defs";

const MIN_ADMIN_PASSWORD_LENGTH = 10;
const BCRYPT_ROUNDS = 12;

async function seedHotels(db: PrismaClient) {
  for (const { code, name } of HOTELS) {
    const hotel = await db.hotel.upsert({
      where: { code },
      create: { code, name, isSystemDefault: true },
      update: { name, isSystemDefault: true },
    });
    for (const moduleKey of HOTEL_MODULES) {
      await db.hotelModule.upsert({
        where: { hotelId_moduleKey: { hotelId: hotel.id, moduleKey } },
        create: { hotelId: hotel.id, moduleKey, enabled: true },
        update: {}, // an operator may have switched the module off
      });
    }
    // Looked up by type, not name: an admin may have renamed it, and a hotel may have only one.
    const roomService = await db.outlet.findFirst({
      where: { hotelId: hotel.id, type: ROOM_SERVICE_OUTLET.type },
    });
    if (!roomService) {
      await db.outlet.create({ data: { hotelId: hotel.id, ...ROOM_SERVICE_OUTLET } });
    }
  }
}

async function seedScreens(db: PrismaClient) {
  for (const screen of SCREENS) {
    await db.appScreen.upsert({
      where: { code: screen.code },
      create: screen,
      update: screen,
    });
  }
}

async function seedRoles(db: PrismaClient) {
  for (const role of ROLES) {
    const data = {
      name: role.name,
      kind: role.kind,
      maxOnlineMinutes: role.maxOnlineMinutes ?? null,
      defaultScreen: role.defaultScreen,
      isSystem: true,
    };
    await db.role.upsert({
      where: { code: role.code },
      create: { code: role.code, ...data },
      update: data,
    });
  }
}

/**
 * System-wide (hotelId = null) permission matrix and module access.
 * Postgres treats NULLs as distinct, so Prisma cannot upsert on these keys: existing rows are
 * looked up on the natural key and only missing ones are created (the partial unique indexes from
 * migration 0002 guard against duplicates). Rows an administrator has since edited are left alone.
 */
async function seedPermissions(db: PrismaClient) {
  const roles = await db.role.findMany();
  const screens = await db.appScreen.findMany();
  const roleId = new Map(roles.map((r) => [r.code, r.id]));
  const screenId = new Map(screens.map((s) => [s.code, s.id]));

  const existingPerms = new Set(
    (await db.roleScreenPermission.findMany({ where: { hotelId: null } })).map(
      (p) => `${p.roleId}|${p.screenId}`,
    ),
  );
  const existingAccess = new Set(
    (await db.roleModuleAccess.findMany({ where: { hotelId: null } })).map(
      (a) => `${a.roleId}|${a.moduleKey}`,
    ),
  );

  const allModules = [...new Set(SCREENS.map((s) => s.moduleKey))];

  for (const role of ROLES) {
    const rid = roleId.get(role.code)!;

    for (const screen of SCREENS) {
      const actions = actionsFor(role, screen);
      const sid = screenId.get(screen.code)!;
      if (actions.length === 0 || existingPerms.has(`${rid}|${sid}`)) continue;
      await db.roleScreenPermission.create({
        data: {
          roleId: rid,
          screenId: sid,
          hotelId: null,
          canView: actions.includes("V"),
          canCreate: actions.includes("O"),
          canEdit: actions.includes("D"),
          canApprove: actions.includes("A"),
          canReport: actions.includes("R"),
        },
      });
    }

    for (const moduleKey of roleModules(role, allModules)) {
      if (existingAccess.has(`${rid}|${moduleKey}`)) continue;
      await db.roleModuleAccess.create({
        data: { roleId: rid, hotelId: null, moduleKey, enabled: true },
      });
    }
  }

  // Existing databases kept the first CR-ONL row (view + report). Hotel managers also need A
  // (force logout). Fresh seeds already write A; this only lifts rows that were created earlier.
  const onlineScreen = screenId.get("CR-ONL");
  if (onlineScreen) {
    const managerIds = ROLES.filter((role) => role.kind === "YONETIM")
      .map((role) => roleId.get(role.code))
      .filter((id): id is string => id !== undefined);
    if (managerIds.length > 0) {
      await db.roleScreenPermission.updateMany({
        where: { screenId: onlineScreen, hotelId: null, roleId: { in: managerIds } },
        data: { canView: true, canApprove: true, canReport: true },
      });
    }
  }
}

/** System settings (hotelId = null): created when missing, never overwritten. */
async function seedSettings(db: PrismaClient) {
  const existing = new Set(
    (await db.setting.findMany({ where: { hotelId: null }, select: { key: true } })).map(
      (s) => s.key,
    ),
  );
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing.has(key)) continue;
    await db.setting.create({ data: { hotelId: null, key, value: value as never } });
  }
}

/** The admin password has no default: a missing or weak value must stop the seed. */
function requireAdminPassword(): string {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_ADMIN_PASSWORD tanımlı değil veya ${MIN_ADMIN_PASSWORD_LENGTH} karakterden kısa; .env dosyasına ekleyin`,
    );
  }
  return password;
}

/** Creates the admin user once; an existing admin (and its password) is left untouched. */
async function seedAdmin(db: PrismaClient, password: string) {
  if (await db.user.findUnique({ where: { username: "admin" } })) return;

  const role = await db.role.findUniqueOrThrow({ where: { code: "R-SYS" } });
  await db.user.create({
    data: {
      username: "admin",
      fullName: "Sistem Yöneticisi",
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      roleId: role.id,
    },
  });
}

/** Idempotent: safe to run any number of times against the same database. */
export async function runSeed(db: PrismaClient): Promise<void> {
  const adminPassword = requireAdminPassword(); // fail closed, before anything is written
  await seedHotels(db);
  await seedScreens(db);
  await seedRoles(db);
  await seedPermissions(db);
  await seedSettings(db);
  await seedAdmin(db, adminPassword);
}

async function main() {
  // Loaded lazily so importing runSeed (tests) does not require the full app environment.
  const { prisma } = await import("@/lib/prisma");
  try {
    await runSeed(prisma);
    const [hotels, roles, screens] = await Promise.all([
      prisma.hotel.count(),
      prisma.role.count(),
      prisma.appScreen.count(),
    ]);
    console.log(`Seed tamamlandı: ${hotels} otel, ${roles} rol, ${screens} ekran`);
  } finally {
    await prisma.$disconnect();
  }
}

if (/^seed\.[cm]?[jt]s$/.test(path.basename(process.argv[1] ?? ""))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
