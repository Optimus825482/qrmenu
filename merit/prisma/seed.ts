import "dotenv/config";
import path from "node:path";
import bcrypt from "bcryptjs";
import { type PrismaClient } from "@/generated/prisma/client";
import { SCREENS } from "@/modules/core/screens";
import { HOTEL_MODULES, HOTELS, ROOM_SERVICE_OUTLET } from "./seed/hotels";
import { ROLES, actionsFor, roleModules } from "./seed/roles";
import { DEFAULT_SETTINGS } from "./seed/settings";

const FALLBACK_ADMIN_PASSWORD = "Merit!2026";
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
    await db.outlet.upsert({
      where: { hotelId_name: { hotelId: hotel.id, name: ROOM_SERVICE_OUTLET.name } },
      create: { hotelId: hotel.id, ...ROOM_SERVICE_OUTLET },
      update: {},
    });
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

/** Creates the admin user once; an existing admin (and its password) is left untouched. */
async function seedAdmin(db: PrismaClient) {
  if (await db.user.findUnique({ where: { username: "admin" } })) return;

  let password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    console.warn(
      "UYARI: SEED_ADMIN_PASSWORD tanımlı değil; admin için varsayılan şifre kullanılıyor. İlk girişten sonra değiştirin.",
    );
    password = FALLBACK_ADMIN_PASSWORD;
  }
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
  await seedHotels(db);
  await seedScreens(db);
  await seedRoles(db);
  await seedPermissions(db);
  await seedSettings(db);
  await seedAdmin(db);
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
