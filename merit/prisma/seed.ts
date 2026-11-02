import "dotenv/config";
import path from "node:path";
import bcrypt from "bcryptjs";
import { type PrismaClient } from "@/generated/prisma/client";
import { SCREENS } from "@/modules/core/screens";
import { HOTEL_MODULES, HOTELS } from "./seed/hotels";
import { MENU_THEMES } from "./seed/menuThemes";
import { ROLES, actionsFor, roleModules } from "./seed/roles";
import { DEFAULT_SETTINGS } from "../src/lib/settings-defs";
import { SEED_OUTLETS } from "./seed/outlets";
import { isLegacySampleCategory, sampleMenuForOutlet } from "./seed/sampleMenus";
import { seedOutletMenuDesigns } from "./seed/menuDesigns";
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
      update: { name, isSystemDefault: true, isActive: true },
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

/** Creates the admin user or updates password to match SEED_ADMIN_PASSWORD. */
async function seedAdmin(db: PrismaClient, password: string) {
  const role = await db.role.findUniqueOrThrow({ where: { code: "R-SYS" } });
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.user.upsert({
    where: { username: "admin" },
    create: {
      username: "admin",
      fullName: "Sistem Yöneticisi",
      passwordHash,
      roleId: role.id,
      isActive: true,
    },
    update: {
      passwordHash,
      isActive: true,
      roleId: role.id,
    },
  });
}

/** Outlet/area/table demo data: create missing rows and preserve any operator adjustments. */
async function seedOutlets(db: PrismaClient) {
  const hotels = await db.hotel.findMany({ where: { code: { in: ["DIAMOND", "ROYAL", "PREMIUM"] } }, select: { id: true, code: true } });
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

/** Adds realistic demo menu trees to every menu outlet; existing rows are left untouched. */
export async function seedSampleMenus(db: PrismaClient) {
  const outlets = await db.outlet.findMany({
    where: { hasMenu: true, isActive: true },
    select: { id: true, name: true, type: true },
    orderBy: [{ hotelId: "asc" }, { name: "asc" }],
  });

  const ensureNode = async (input: {
    outletId: string;
    parentId: string | null;
    kind: MenuNodeKind;
    name: string;
    detail?: string;
    price?: number;
    imageUrl?: string;
    allergens?: string[];
    tags?: string[];
  }) => {
    const existing = await db.menuNode.findFirst({
      where: { outletId: input.outletId, parentId: input.parentId, kind: input.kind, name: input.name },
      select: { id: true },
    });
    if (existing) {
      await db.menuNode.update({ where: { id: existing.id }, data: {
        detail: input.detail ?? null, price: input.price ?? null, imageUrl: input.imageUrl ?? null,
        allergens: input.allergens ?? [], tags: input.tags ?? [],
      } });
      return existing.id;
    }
    const siblings = await db.menuNode.aggregate({
      where: { outletId: input.outletId, parentId: input.parentId },
      _max: { sortOrder: true },
    });
    const created = await db.menuNode.create({
      data: {
        outletId: input.outletId,
        parentId: input.parentId,
        kind: input.kind,
        name: input.name,
        detail: input.detail,
        price: input.price,
        imageUrl: input.imageUrl,
        allergens: input.allergens ?? [],
        tags: input.tags ?? [],
        sortOrder: (siblings._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    return created.id;
  };

  for (const outlet of outlets) {
    const categories = sampleMenuForOutlet(outlet.type as OutletType, outlet.name);
    const roots = await db.menuNode.findMany({ where: { outletId: outlet.id, parentId: null, kind: "KATEGORI", isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
    const managedRoots = roots.filter((node) => isLegacySampleCategory(node.name) || categories.some((category) => category.name === node.name));
    const usedRootIds = new Set<string>();
    for (const [index, category] of categories.entries()) {
      // Keep the ids of the existing demo tree; replace only roots known to be generated samples.
      const categoryId = managedRoots.find((node) => node.name === category.name)?.id ?? managedRoots[index]?.id ?? await ensureNode({ outletId: outlet.id, parentId: null, kind: "KATEGORI", name: category.name });
      usedRootIds.add(categoryId);
      await db.menuNode.update({ where: { id: categoryId }, data: { name: category.name, detail: null, sortOrder: index, isActive: true } });
      const existingDirectItems = await db.menuNode.findMany({ where: { outletId: outlet.id, parentId: categoryId, kind: "OGE" }, orderBy: { sortOrder: "asc" }, select: { id: true } });
      for (const [itemIndex, menuItem] of (category.items ?? []).entries()) {
        const nodeInput = { outletId: outlet.id, parentId: categoryId, kind: "OGE" as const, name: menuItem.name, detail: menuItem.detail, price: menuItem.price, imageUrl: menuItem.image, allergens: menuItem.allergens, tags: menuItem.tags };
        if (existingDirectItems[itemIndex]) await db.menuNode.update({ where: { id: existingDirectItems[itemIndex].id }, data: { name: menuItem.name, detail: menuItem.detail, price: menuItem.price, imageUrl: menuItem.image, allergens: menuItem.allergens ?? [], tags: menuItem.tags ?? [], sortOrder: itemIndex } });
        else await ensureNode(nodeInput);
      }
      const existingSubs = await db.menuNode.findMany({ where: { outletId: outlet.id, parentId: categoryId, kind: "ALT_KATEGORI" }, orderBy: { sortOrder: "asc" }, select: { id: true } });
      for (const [subIndex, subcategory] of (category.subcategories ?? []).entries()) {
        const subcategoryId = existingSubs[subIndex]?.id ?? await ensureNode({ outletId: outlet.id, parentId: categoryId, kind: "ALT_KATEGORI", name: subcategory.name });
        await db.menuNode.update({ where: { id: subcategoryId }, data: { name: subcategory.name, sortOrder: subIndex } });
        const existingItems = await db.menuNode.findMany({ where: { outletId: outlet.id, parentId: subcategoryId, kind: "OGE" }, orderBy: { sortOrder: "asc" }, select: { id: true } });
        for (const [itemIndex, menuItem] of subcategory.items.entries()) {
          if (existingItems[itemIndex]) await db.menuNode.update({ where: { id: existingItems[itemIndex].id }, data: { name: menuItem.name, detail: menuItem.detail, price: menuItem.price, imageUrl: menuItem.image, allergens: menuItem.allergens ?? [], tags: menuItem.tags ?? [], sortOrder: itemIndex } });
          else await ensureNode({ outletId: outlet.id, parentId: subcategoryId, kind: "OGE", name: menuItem.name, detail: menuItem.detail, price: menuItem.price, imageUrl: menuItem.image, allergens: menuItem.allergens, tags: menuItem.tags });
        }
      }
    }
    for (const obsolete of managedRoots) {
      if (usedRootIds.has(obsolete.id)) continue;
      await db.menuNode.update({ where: { id: obsolete.id }, data: { isActive: false } });
    }
  }
}

/** Three realistic staff accounts per seeded outlet; new accounts must change the temporary password. */
async function seedSampleStaff(db: PrismaClient) {
  const hotels = await db.hotel.findMany({ where: { code: { in: ["DIAMOND", "ROYAL", "PREMIUM"] } }, select: { id: true, code: true } });
  const roles = await db.role.findMany({ where: { code: { in: ["R-SGF", "R-MUS", "R-GAR"] } }, select: { id: true, code: true } });
  const roleIds = new Map(roles.map((role) => [role.code, role.id]));
  const passwordHash = await bcrypt.hash("123456", BCRYPT_ROUNDS);
  const hotelsByCode = new Map(hotels.map((hotel) => [hotel.code, hotel.id]));
  const oldLogins: Record<string, string> = { "R-SGF": "outlet.sefi", "R-MUS": "mutfak.sefi", "R-GAR": "garson" };
  const oldHotelSuffix: Record<string, string> = { ROYAL: "mr", DIAMOND: "mrd", PREMIUM: "mrp" };
  const people: Record<string, string[]> = {
    "R-SGF": ["Derya Aksoy", "Hakan Demir", "Pınar Yıldız", "Murat Şahin", "Ece Yılmaz", "Burak Aydın", "Selin Kaya", "Kerem Çelik", "Zeynep Arslan", "Emre Koç", "Cansu Özkan", "Arda Güneş", "Buse Kurt", "Okan Polat", "İrem Doğan", "Selçuk Ergin", "Işıl Korkmaz", "Baran Sönmez", "Özge Kara"],
    "R-MUS": ["Mehmet Kaya", "Ayşe Demir", "Onur Şahin", "Elif Yılmaz", "Serkan Arslan", "Sibel Aydın", "Mert Çelik", "Esra Koç", "Kaan Özkan", "Deniz Güneş", "Ceren Kurt", "Tolga Polat", "Nil Doğan", "Furkan Aksoy", "Melis Yıldız", "Cemal Keskin", "Asuman Ergin", "Kıvanç Yüce", "Gamze Çoban"],
    "R-GAR": ["Eren Yalçın", "Aslı Kılıç", "Ahmet Erdem", "Yağmur Keskin", "Yusuf Toprak", "Ezgi Bayram", "Berk Uçar", "Seda Tunç", "Kadir Taş", "Dilan Bal", "Can Keser", "Gülce Dinç", "Fırat Söylemez", "Nisa Eren", "Arif Ünal", "Lale Şen", "Emrah Taş", "Poyraz Işık", "Gökçe Uysal"],
  };

  // Reuse the old demo accounts for the first outlet at each hotel so `*.mr` logins disappear
  // without losing their existing passwords. Their old memberships are rebuilt below.
  const seededOutlets: { hotelCode: string; index: number; outletId: string; hotelId: string }[] = [];
  for (const [index, definition] of SEED_OUTLETS.entries()) {
    const hotelId = hotelsByCode.get(definition.hotelCode);
    if (!hotelId) continue;
    const outlet = await db.outlet.findFirst({ where: { hotelId, name: definition.name }, select: { id: true } });
    if (outlet) seededOutlets.push({ hotelCode: definition.hotelCode, index, outletId: outlet.id, hotelId });
  }
  let extraIndex = SEED_OUTLETS.length;
  for (const hotel of hotels) {
    const seededNames = SEED_OUTLETS.filter((definition) => definition.hotelCode === hotel.code).map((definition) => definition.name);
    const extraOutlets = await db.outlet.findMany({
      where: { hotelId: hotel.id, ...(seededNames.length ? { name: { notIn: seededNames } } : {}) },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    for (const outlet of extraOutlets) seededOutlets.push({ hotelCode: hotel.code, index: extraIndex++, outletId: outlet.id, hotelId: hotel.id });
  }
  const existingSeededOutletIds = seededOutlets.map((entry) => entry.outletId);
  const legacyUsers = await db.user.findMany({
    where: { username: { in: Object.values(oldHotelSuffix).flatMap((suffix) => Object.values(oldLogins).map((login) => `${login}.${suffix}`)) } },
    select: { id: true },
  });
  if (legacyUsers.length && existingSeededOutletIds.length) {
    await db.outletMember.deleteMany({ where: { userId: { in: legacyUsers.map((user) => user.id) }, outletId: { in: existingSeededOutletIds } } });
  }

  const assignedLegacy = new Set<string>();
  for (const entry of seededOutlets) {
    if (!entry) continue;
    const { hotelCode, index, outletId, hotelId } = entry;
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
      const hotelSuffix = oldHotelSuffix[hotelCode];
      const legacyUsername = `${oldLogins[roleCode]}.${hotelSuffix}`;
      const legacy = assignedLegacy.has(legacyUsername)
        ? null
        : await db.user.findUnique({ where: { username: legacyUsername }, select: { id: true } });
      let userId = existing?.id;
      if (legacy && !existing) {
        const updated = await db.user.update({
          where: { id: legacy.id },
          data: { username, fullName, jobTitle: roleCode === "R-SGF" ? "Outlet Şefi" : roleCode === "R-MUS" ? "Mutfak Şefi" : "Garson", roleId, hotelId },
          select: { id: true },
        });
        assignedLegacy.add(legacyUsername);
        userId = updated.id;
      } else if (existing) {
        await db.user.update({ where: { id: existing.id }, data: { fullName, jobTitle: roleCode === "R-SGF" ? "Outlet Şefi" : roleCode === "R-MUS" ? "Mutfak Şefi" : "Garson", roleId, hotelId } });
      } else {
        const created = await db.user.create({
          data: {
            username,
            fullName,
            jobTitle: roleCode === "R-SGF" ? "Outlet Şefi" : roleCode === "R-MUS" ? "Mutfak Şefi" : "Garson",
            passwordHash,
            mustChangePassword: false,
            roleId,
            hotelId,
          },
          select: { id: true },
        });
        userId = created.id;
      }
      if (!userId) continue;
      await db.outletMember.upsert({
        where: { userId_outletId: { userId, outletId } },
        create: { userId, outletId, roleId },
        update: { roleId, isActive: true },
      });
    }
  }
}

/** Replace old technical demo identities which still exposed hotel-code suffixes. */
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

/** Idempotent: safe to run any number of times against the same database. */
export async function runSeed(db: PrismaClient): Promise<void> {
  const adminPassword = requireAdminPassword(); // fail closed, before anything is written
  await seedHotels(db);
  await seedScreens(db);
  await seedRoles(db);
  await seedOutlets(db);
  await seedMenuThemes(db);
  await seedSampleMenus(db);
  await seedOutletMenuDesigns(db);
  await seedSampleStaff(db);
  await cleanLegacyDemoNames(db);
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
