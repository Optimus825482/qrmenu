import "dotenv/config";
import { randomBytes } from "node:crypto";
import path from "node:path";
import bcrypt from "bcryptjs";
import { type PrismaClient } from "@/generated/prisma/client";
import { SCREENS } from "@/modules/core/screens";
import { DEMO_HOTEL_CODES, HOTEL_MODULES, HOTELS } from "./seed/hotels";
import { MENU_THEMES } from "./seed/menuThemes";
import { ROLES, actionsFor, roleModules } from "./seed/roles";
import { DEFAULT_SETTINGS } from "../src/lib/settings-defs";
import { SEED_OUTLETS } from "./seed/outlets";
import { sampleMenuForOutlet, type SampleMenuItem } from "./seed/sampleMenus";
import { seedOutletMenuDesigns } from "./seed/menuDesigns";
import { seedMinibarDemo } from "./seed/minibarDemo";
import type { MenuNodeKind, OutletType } from "@/generated/prisma/client";
import { suggestedUsername } from "../src/modules/core/usernames";
import { ensureDefaultCallOptions } from "../src/modules/menu/server/callOptionDefaults";

const MIN_ADMIN_PASSWORD_LENGTH = 10;
const BCRYPT_ROUNDS = 12;

async function seedHotels(db: PrismaClient) {
  for (const { code, name } of HOTELS) {
    const hotel = await db.hotel.upsert({
      where: { code },
      create: { code, name, isSystemDefault: true },
      update: { name, isSystemDefault: true }, // never re-activates a hotel an operator switched off
    });
    for (const moduleKey of HOTEL_MODULES) {
      await db.hotelModule.upsert({
        where: { hotelId_moduleKey: { hotelId: hotel.id, moduleKey } },
        create: { hotelId: hotel.id, moduleKey, enabled: true },
        update: {}, // an operator may have switched the module off
      });
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

/** Guest menu themes: created by name when missing, never overwritten. */
async function seedMenuThemes(db: PrismaClient) {
  const existing = new Set((await db.menuTheme.findMany({ select: { name: true } })).map((t) => t.name));
  for (const theme of MENU_THEMES) {
    if (existing.has(theme.name)) continue;
    await db.menuTheme.create({ data: { ...theme, isDefault: theme.isDefault ?? false } });
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

/**
 * Creates the admin user only when missing. An existing admin (password, role, active flag) is never
 * touched, so re-running the seed cannot reset a changed password or re-enable a disabled account.
 */
async function seedAdmin(db: PrismaClient) {
  if (await db.user.findUnique({ where: { username: "admin" }, select: { id: true } })) return;
  const password = requireAdminPassword();
  const role = await db.role.findUniqueOrThrow({ where: { code: "R-SYS" } });
  await db.user.create({
    data: {
      username: "admin",
      fullName: "Sistem Yöneticisi",
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      roleId: role.id,
      isActive: true,
    },
  });
}

/**
 * Reference data: every seeded hotel has exactly one Oda Servisi (ODA_SERVISI) outlet. Created only when the
 * hotel has none; an existing one is never renamed or changed.
 */
async function seedRoomServiceOutlets(db: PrismaClient) {
  const hotels = await db.hotel.findMany({ where: { code: { in: [...DEMO_HOTEL_CODES] } }, select: { id: true } });
  for (const { id: hotelId } of hotels) {
    if (await db.outlet.findFirst({ where: { hotelId, type: "ODA_SERVISI" }, select: { id: true } })) continue;
    const outlet = await db.outlet.create({
      data: { hotelId, name: "Oda Servisi", type: "ODA_SERVISI", hasMenu: true, hasOrdering: true, orderingEnabled: true, kdsEnabled: true },
      select: { id: true },
    });
    await ensureDefaultCallOptions(db, outlet.id);
  }
}

/** DEMO (SEED_DEMO=true): outlet/area/table data; creates missing rows and preserves any operator adjustments. */
async function seedOutlets(db: PrismaClient) {
  const hotels = await db.hotel.findMany({ where: { code: { in: [...DEMO_HOTEL_CODES] } }, select: { id: true, code: true } });
  const hotelIds = new Map(hotels.map((hotel) => [hotel.code, hotel.id]));
  for (const definition of SEED_OUTLETS) {
    const hotelId = hotelIds.get(definition.hotelCode);
    if (!hotelId) continue;
    const existing = await db.outlet.findFirst({ where: { hotelId, name: definition.name }, select: { id: true } });
    const outlet = existing ?? await db.outlet.create({
      data: {
        hotelId,
        name: definition.name,
        type: definition.type,
        hasMenu: true,
        hasOrdering: true,
        orderingEnabled: true,
        kdsEnabled: true,
      },
      select: { id: true },
    });
    if (!existing) {
      await ensureDefaultCallOptions(db, outlet.id);
    }
    let nextNumber = 1;
    for (const areaDefinition of definition.areas) {
      const area = await db.outletAreaDefinition.findFirst({
        where: { outletId: outlet.id, type: areaDefinition.type, name: areaDefinition.name },
        select: { id: true },
      }) ?? await db.outletAreaDefinition.create({
        data: { outletId: outlet.id, type: areaDefinition.type, name: areaDefinition.name, orderingEnabled: true },
        select: { id: true },
      });
      for (let index = 0; index < areaDefinition.tableCount; index += 1) {
        const number = nextNumber++;
        const label = `${definition.name} ${number}`;
        await db.outletTable.upsert({
          where: { outletId_number: { outletId: outlet.id, number } },
          create: {
            outletId: outlet.id,
            areaId: area.id,
            number,
            name: null,
            label,
            capacity: [2, 4, 4, 6][(number - 1) % 4],
          },
          update: {},
        });
      }
    }
  }
}

/**
 * DEMO (SEED_DEMO=true): realistic menu trees for the seeded demo outlets. Writes ONLY into an outlet that
 * has no menu nodes at all; existing nodes are never renamed, re-priced, re-activated or deactivated.
 */
export async function seedSampleMenus(db: PrismaClient) {
  const outlets = await db.outlet.findMany({
    where: {
      hasMenu: true,
      isActive: true,
      OR: SEED_OUTLETS.map((o) => ({ name: o.name, hotel: { code: o.hotelCode } })),
    },
    select: { id: true, name: true, type: true },
    orderBy: [{ hotelId: "asc" }, { name: "asc" }],
  });

  const create = async (input: {
    outletId: string;
    parentId: string | null;
    kind: MenuNodeKind;
    name: string;
    sortOrder: number;
    detail?: string;
    price?: number;
    imageUrl?: string;
    allergens?: string[];
    tags?: string[];
  }) =>
    (
      await db.menuNode.create({
        data: { ...input, allergens: input.allergens ?? [], tags: input.tags ?? [] },
        select: { id: true },
      })
    ).id;

  for (const outlet of outlets) {
    if ((await db.menuNode.count({ where: { outletId: outlet.id } })) > 0) continue;
    const categories = sampleMenuForOutlet(outlet.type as OutletType, outlet.name);
    const addItem = (outletId: string, parentId: string, sortOrder: number, m: SampleMenuItem) =>
      create({ outletId, parentId, kind: "OGE", name: m.name, detail: m.detail, price: m.price, imageUrl: m.image, allergens: m.allergens, tags: m.tags, sortOrder });
    for (const [index, category] of categories.entries()) {
      const categoryId = await create({ outletId: outlet.id, parentId: null, kind: "KATEGORI", name: category.name, sortOrder: index });
      for (const [itemIndex, menuItem] of (category.items ?? []).entries()) {
        await addItem(outlet.id, categoryId, itemIndex, menuItem);
      }
      for (const [subIndex, subcategory] of (category.subcategories ?? []).entries()) {
        const subId = await create({ outletId: outlet.id, parentId: categoryId, kind: "ALT_KATEGORI", name: subcategory.name, sortOrder: subIndex });
        for (const [itemIndex, menuItem] of subcategory.items.entries()) {
          await addItem(outlet.id, subId, itemIndex, menuItem);
        }
      }
    }
  }
}

/**
 * DEMO (SEED_DEMO=true): three staff accounts per seeded outlet. New accounts get a random, unlogged
 * password and must change it (an administrator sets a real one). Existing users and memberships are
 * never modified (no role/hotel/active reset).
 */
async function seedSampleStaff(db: PrismaClient) {
  const hotels = await db.hotel.findMany({ where: { code: { in: [...DEMO_HOTEL_CODES] } }, select: { id: true, code: true } });
  const roles = await db.role.findMany({ where: { code: { in: ["R-SGF", "R-MUS", "R-GAR"] } }, select: { id: true, code: true } });
  const roleIds = new Map(roles.map((role) => [role.code, role.id]));
  const hotelsByCode = new Map(hotels.map((hotel) => [hotel.code, hotel.id]));
  const jobTitles: Record<string, string> = { "R-SGF": "Outlet Şefi", "R-MUS": "Mutfak Şefi", "R-GAR": "Garson" };
  const people: Record<string, string[]> = {
    "R-SGF": ["Derya Aksoy", "Hakan Demir", "Pınar Yıldız", "Murat Şahin", "Ece Yılmaz", "Burak Aydın", "Selin Kaya", "Kerem Çelik", "Zeynep Arslan", "Emre Koç", "Cansu Özkan", "Arda Güneş", "Buse Kurt", "Okan Polat", "İrem Doğan", "Selçuk Ergin", "Işıl Korkmaz", "Baran Sönmez", "Özge Kara"],
    "R-MUS": ["Mehmet Kaya", "Ayşe Demir", "Onur Şahin", "Elif Yılmaz", "Serkan Arslan", "Sibel Aydın", "Mert Çelik", "Esra Koç", "Kaan Özkan", "Deniz Güneş", "Ceren Kurt", "Tolga Polat", "Nil Doğan", "Furkan Aksoy", "Melis Yıldız", "Cemal Keskin", "Asuman Ergin", "Kıvanç Yüce", "Gamze Çoban"],
    "R-GAR": ["Eren Yalçın", "Aslı Kılıç", "Ahmet Erdem", "Yağmur Keskin", "Yusuf Toprak", "Ezgi Bayram", "Berk Uçar", "Seda Tunç", "Kadir Taş", "Dilan Bal", "Can Keser", "Gülce Dinç", "Fırat Söylemez", "Nisa Eren", "Arif Ünal", "Lale Şen", "Emrah Taş", "Poyraz Işık", "Gökçe Uysal"],
  };

  for (const [index, definition] of SEED_OUTLETS.entries()) {
    const hotelId = hotelsByCode.get(definition.hotelCode);
    if (!hotelId) continue;
    const outlet = await db.outlet.findFirst({ where: { hotelId, name: definition.name }, select: { id: true } });
    if (!outlet) continue;
    for (const roleCode of ["R-SGF", "R-MUS", "R-GAR"] as const) {
      const roleId = roleIds.get(roleCode);
      const fullName = people[roleCode]?.[index];
      if (!roleId || !fullName) continue;
      const usernameBase = suggestedUsername(fullName);
      let username = usernameBase;
      let existing = await db.user.findUnique({ where: { username }, select: { id: true, fullName: true } });
      if (existing && existing.fullName !== fullName) {
        for (let suffix = 2; ; suffix += 1) {
          username = `${usernameBase.slice(0, 38)}${suffix}`;
          existing = await db.user.findUnique({ where: { username }, select: { id: true, fullName: true } });
          if (!existing || existing.fullName === fullName) break;
        }
      }
      const userId =
        existing?.id ??
        (
          await db.user.create({
            data: {
              username,
              fullName,
              jobTitle: jobTitles[roleCode],
              passwordHash: await bcrypt.hash(randomBytes(18).toString("base64url"), BCRYPT_ROUNDS),
              mustChangePassword: true,
              roleId,
              hotelId,
            },
            select: { id: true },
          })
        ).id;
      await db.outletMember.upsert({
        where: { userId_outletId: { userId, outletId: outlet.id } },
        create: { userId, outletId: outlet.id, roleId },
        update: {}, // an existing membership (role, active flag) is left as it is
      });
    }
  }
}

/** DEMO: replace old technical demo identities which still exposed hotel-code suffixes (rename only). */
async function cleanLegacyDemoNames(db: PrismaClient) {
  const legacyNames = [
    { from: "ayar.mr", username: "serkan.aksoy", fullName: "Serkan Aksoy", jobTitle: "F&B Müdürü" },
    { from: "fbm.mr", username: "seda.yilmaz", fullName: "Seda Yılmaz", jobTitle: "F&B Müdürü" },
    { from: "kat.mr", username: "aylin.kaya", fullName: "Aylin Kaya", jobTitle: "Kat Sorumlusu" },
    { from: "mudur.mr", username: "faruk.yildiz", fullName: "Faruk Yıldız", jobTitle: "Otel Müdürü" },
  ];
  for (const person of legacyNames) {
    const legacy = await db.user.findUnique({ where: { username: person.from }, select: { id: true } });
    if (!legacy) continue;
    const existing = await db.user.findUnique({ where: { username: person.username }, select: { id: true } });
    if (existing) continue;
    await db.user.update({
      where: { id: legacy.id },
      data: { username: person.username, fullName: person.fullName, jobTitle: person.jobTitle },
    });
  }
}

/** True when demo/sample data was requested explicitly (SEED_DEMO=true). Never on by default. */
function demoRequested(): boolean {
  return process.env.SEED_DEMO === "true";
}

/**
 * Idempotent: safe to run any number of times. Reference data (hotels, roles, screens, permissions,
 * settings, themes) is created/refreshed; the admin is created only when missing. Demo data (outlets,
 * sample menus and designs, sample staff) is written only with SEED_DEMO=true.
 */
export async function runSeed(db: PrismaClient): Promise<void> {
  // Fail closed, before anything is written: a first-time admin needs a strong password.
  if (!(await db.user.findUnique({ where: { username: "admin" }, select: { id: true } }))) requireAdminPassword();
  await seedHotels(db);
  await seedScreens(db);
  await seedRoles(db);
  await seedRoomServiceOutlets(db);
  await seedMenuThemes(db);
  await seedPermissions(db);
  await seedSettings(db);
  await seedAdmin(db);
  if (demoRequested()) {
    await seedOutlets(db);
    await seedSampleMenus(db);
    await seedOutletMenuDesigns(db);
    await seedMinibarDemo(db);
    await seedSampleStaff(db);
    await cleanLegacyDemoNames(db);
  }
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
