import "dotenv/config";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { OrderStatus, OutletType, Prisma, PrismaClient, TaskStatus } from "@/generated/prisma/client";
import { businessDate, businessDateStart, businessDay } from "../src/lib/time";
import { ensureDefaultCallOptions } from "../src/modules/menu/server/callOptionDefaults";
import { DEMO_OUTLETS, DEMO_ROOM_SERVICE_MENU, TRANSLATION_LANGS, type DemoCategory } from "./seed/demoMenus";

/*
 * Training / demo world (npm run db:seed:demo). Runs ONLY against a training database and AFTER the base seed
 * (`npm run db:seed`). Every entity is created through its natural key, so a second run changes no row count;
 * rows an operator edited are not overwritten (except the demo users' password, which follows DEMO_PASSWORD).
 * Day-relative data (occupancy, tasks, orders, MyBar, DND) is keyed by the business day ('DEMO-<yyyy-MM-dd>'),
 * so a later run adds the new day and keeps the earlier ones.
 */

const MIN_PASSWORD_LENGTH = 10;
const BCRYPT_ROUNDS = 12;
const HISTORY_DAYS = 7;
const DEMO_EMAIL_DOMAIN = "example.invalid";
/** Training database name: ends in _egitim / _demo / _test, optionally followed by a parallel-run suffix (_test_ab12). */
const DB_NAME_RE = /(_egitim|_demo|_test)(_[a-z0-9]+)?$/;

export const DEMO_DB_ERROR = "Demo verisi yalnız eğitim veritabanına yüklenebilir";

export interface DemoSummary {
  database: string;
  today: string;
  hotels: string[];
  floors: number;
  rooms: number;
  products: number;
  outlets: number;
  tables: number;
  menuItems: number;
  users: { username: string; role: string }[];
  orders: number;
  mybarRequests: number;
  dnds: number;
  dailyTasks: number;
  guestRecords: number;
  minibarTransactions: number;
}

/** Throws unless `name` is a training database name. Pure, so the CLI can also refuse before connecting. */
export function assertTrainingDatabase(name: string): void {
  if (!DB_NAME_RE.test(name)) throw new Error(`${DEMO_DB_ERROR} (veritabanı: ${name || "?"})`);
}

/** Database name from a connection string (query string ignored). */
export function databaseNameFromUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

function requireDemoPassword(): string {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`DEMO_PASSWORD tanımlı değil veya ${MIN_PASSWORD_LENGTH} karakterden kısa; ortam değişkeni olarak verin`);
  }
  return password;
}

const shiftDay = (day: string, delta: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
const at = (day: string, hour: number, minute = 0): Date =>
  new Date(businessDateStart(day).getTime() + (hour * 60 + minute) * 60_000);

// ───────────────────────────── users ─────────────────────────────

interface DemoUser {
  username: string;
  fullName: string;
  jobTitle: string;
  role: string;
  outlets: "all" | "pool" | "room" | "none" | "pool+beach";
  extraHotels?: string[];
}

const DEMO_USERS: DemoUser[] = [
  { username: "egitim.admin", fullName: "Eğitim Otel Müdürü", jobTitle: "Otel Müdürü", role: "R-OTM", outlets: "none", extraHotels: ["DIAMOND"] },
  { username: "egitim.fbm", fullName: "Eğitim F&B Müdürü", jobTitle: "F&B Müdürü", role: "R-FBM", outlets: "all" },
  { username: "egitim.sgf", fullName: "Eğitim Şef Garson", jobTitle: "Şef Garson", role: "R-SGF", outlets: "all" },
  { username: "egitim.garson1", fullName: "Eğitim Garson 1", jobTitle: "Garson", role: "R-GAR", outlets: "pool" },
  { username: "egitim.garson2", fullName: "Eğitim Garson 2", jobTitle: "Garson", role: "R-GAR", outlets: "pool" },
  { username: "egitim.garson3", fullName: "Eğitim Garson 3", jobTitle: "Garson", role: "R-GAR", outlets: "pool+beach" },
  { username: "egitim.kasa", fullName: "Eğitim Kasiyer", jobTitle: "Kasa", role: "R-KAS", outlets: "all" },
  { username: "egitim.mutfak", fullName: "Eğitim Mutfak Şefi", jobTitle: "Mutfak Şefi", role: "R-MUS", outlets: "all" },
  { username: "egitim.kds", fullName: "Eğitim KDS Operatörü", jobTitle: "KDS Operatörü", role: "R-KDS", outlets: "all" },
  { username: "egitim.oda", fullName: "Eğitim Oda Servisi", jobTitle: "Oda Servisi Görevlisi", role: "R-ODS", outlets: "room" },
  { username: "egitim.kat1", fullName: "Eğitim Kat Sorumlusu 1", jobTitle: "Kat Sorumlusu", role: "R-KAT", outlets: "none" },
  { username: "egitim.kat2", fullName: "Eğitim Kat Sorumlusu 2", jobTitle: "Kat Sorumlusu", role: "R-KAT", outlets: "none" },
  { username: "egitim.depo", fullName: "Eğitim Depo Sorumlusu", jobTitle: "Depo Sorumlusu", role: "R-DEP", outlets: "none" },
];

async function seedUsers(db: PrismaClient, password: string, hotelIds: Map<string, string>) {
  const roles = new Map((await db.role.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id]));
  const ids = new Map<string, string>();
  for (const u of DEMO_USERS) {
    const roleId = roles.get(u.role);
    if (!roleId) throw new Error(`Rol ${u.role} yok; önce temel seed çalıştırılmalı (npm run db:seed)`);
    const hotelId = hotelIds.get("ROYAL")!;
    const existing = await db.user.findUnique({ where: { username: u.username }, select: { id: true, passwordHash: true } });
    let id: string;
    if (existing) {
      id = existing.id;
      const same = await bcrypt.compare(password, existing.passwordHash);
      await db.user.update({
        where: { id },
        data: {
          fullName: u.fullName,
          jobTitle: u.jobTitle,
          roleId,
          hotelId,
          isActive: true,
          mustChangePassword: false,
          ...(same ? {} : { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) }),
        },
      });
    } else {
      id = (
        await db.user.create({
          data: {
            username: u.username,
            fullName: u.fullName,
            jobTitle: u.jobTitle,
            email: `${u.username}@${DEMO_EMAIL_DOMAIN}`,
            emailOptIn: false,
            passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
            roleId,
            hotelId,
          },
          select: { id: true },
        })
      ).id;
    }
    ids.set(u.username, id);
    for (const code of u.extraHotels ?? []) {
      const extra = hotelIds.get(code);
      if (extra) await db.userHotel.upsert({ where: { userId_hotelId: { userId: id, hotelId: extra } }, create: { userId: id, hotelId: extra }, update: {} });
    }
  }
  return ids;
}

// ───────────────────────────── rooms and minibar ─────────────────────────────

interface HotelPlan {
  code: string;
  floors: number[];
  roomsPerFloor: number;
}
const HOTEL_PLANS: HotelPlan[] = [
  { code: "ROYAL", floors: [1, 2, 3], roomsPerFloor: 10 },
  { code: "DIAMOND", floors: [1], roomsPerFloor: 5 },
];
const EXTENSIONS = new Map([["101", "4101"], ["102", "4102"], ["201", "4201"]]);

const MINIBAR_PRODUCTS: { code: string; name: string; group: string; price: string; cost: string }[] = [
  { code: "DEMO-SU", name: "Su 0,5 L", group: "İçecek", price: "1.00", cost: "0.30" },
  { code: "DEMO-MADEN", name: "Maden Suyu", group: "İçecek", price: "1.50", cost: "0.40" },
  { code: "DEMO-KOLA", name: "Kola", group: "İçecek", price: "3.50", cost: "1.00" },
  { code: "DEMO-MEYVE", name: "Meyve Suyu", group: "İçecek", price: "3.00", cost: "0.90" },
  { code: "DEMO-BIRA", name: "Bira", group: "Alkollü İçecek", price: "4.50", cost: "1.50" },
  { code: "DEMO-SARAP", name: "Şarap (küçük)", group: "Alkollü İçecek", price: "9.00", cost: "3.50" },
  { code: "DEMO-VISKI", name: "Viski Mini", group: "Alkollü İçecek", price: "7.00", cost: "2.50" },
  { code: "DEMO-CIKOLATA", name: "Çikolata", group: "Atıştırmalık", price: "4.00", cost: "1.20" },
  { code: "DEMO-CIPS", name: "Cips", group: "Atıştırmalık", price: "4.50", cost: "1.40" },
  { code: "DEMO-BISKUVI", name: "Bisküvi", group: "Atıştırmalık", price: "3.00", cost: "0.80" },
  { code: "DEMO-FISTIK", name: "Fıstık", group: "Kuruyemiş", price: "5.00", cost: "1.80" },
  { code: "DEMO-BADEM", name: "Badem", group: "Kuruyemiş", price: "6.00", cost: "2.20" },
];
const SETUPS: { name: string; items: [string, number][] }[] = [
  { name: "DEMO MINI", items: [["DEMO-SU", 4], ["DEMO-MADEN", 2], ["DEMO-KOLA", 2], ["DEMO-MEYVE", 2], ["DEMO-BIRA", 2]] },
  { name: "DEMO ATIŞTIRMA", items: [["DEMO-CIKOLATA", 2], ["DEMO-CIPS", 2], ["DEMO-FISTIK", 2], ["DEMO-BADEM", 1]] },
  { name: "DEMO PREMIUM", items: [["DEMO-SARAP", 1], ["DEMO-VISKI", 2], ["DEMO-BISKUVI", 2]] },
];
/** The one product that sits at its critical level in the pool (training: "kritik stok" warning). */
const CRITICAL_PRODUCT = "DEMO-BIRA";

type Catalog = { products: Map<string, string>; setups: Map<string, string> };

async function seedMinibarCatalog(db: PrismaClient): Promise<Catalog> {
  const groups = new Map<string, string>();
  for (const name of new Set(MINIBAR_PRODUCTS.map((p) => p.group))) {
    groups.set(name, (await db.productGroup.upsert({ where: { name }, create: { name }, update: {} })).id);
  }
  const products = new Map<string, string>();
  for (const p of MINIBAR_PRODUCTS) {
    const row = await db.product.upsert({
      where: { code: p.code },
      create: { code: p.code, name: p.name, groupId: groups.get(p.group)!, salePrice: p.price, purchasePrice: p.cost, criticalLevel: 20 },
      update: {},
    });
    products.set(p.code, row.id);
  }
  const setups = new Map<string, string>();
  for (const s of SETUPS) {
    const setup = await db.setup.upsert({ where: { name: s.name }, create: { name: s.name }, update: {} });
    setups.set(s.name, setup.id);
    for (const [code, qty] of s.items) {
      await db.setupItem.upsert({
        where: { setupId_productId: { setupId: setup.id, productId: products.get(code)! } },
        create: { setupId: setup.id, productId: products.get(code)!, qty },
        update: {},
      });
    }
  }
  return { products, setups };
}

interface HotelWorld {
  id: string;
  code: string;
  rooms: { id: string; number: string; roomTypeId: string; floorNo: number }[];
}

async function seedRooms(db: PrismaClient, hotelIds: Map<string, string>, catalog: Catalog, depoUserId: string): Promise<HotelWorld[]> {
  const { generateQrToken } = await import("../src/lib/qr");
  const worlds: HotelWorld[] = [];
  for (const plan of HOTEL_PLANS) {
    const hotelId = hotelIds.get(plan.code);
    if (!hotelId) continue;
    const standard = await db.roomType.upsert({
      where: { hotelId_name: { hotelId, name: "Standart" } },
      create: { hotelId, name: "Standart", cabinetCount: 2 },
      update: {},
    });
    const suite = await db.roomType.upsert({
      where: { hotelId_name: { hotelId, name: "Suit" } },
      create: { hotelId, name: "Suit", cabinetCount: 3 },
      update: {},
    });
    // Room type to setup assignments: Standart gets MINI + ATIŞTIRMA, Suit all three.
    const assignments: [string, string[]][] = [
      [standard.id, ["DEMO MINI", "DEMO ATIŞTIRMA"]],
      [suite.id, ["DEMO MINI", "DEMO ATIŞTIRMA", "DEMO PREMIUM"]],
    ];
    for (const [roomTypeId, names] of assignments) {
      for (const name of names) {
        const setupId = catalog.setups.get(name)!;
        await db.roomTypeSetup.upsert({
          where: { hotelId_roomTypeId_setupId: { hotelId, roomTypeId, setupId } },
          create: { hotelId, roomTypeId, setupId },
          update: {},
        });
      }
    }
    const rooms: HotelWorld["rooms"] = [];
    for (const floorNo of plan.floors) {
      const floor = await db.floor.upsert({
        where: { hotelId_number: { hotelId, number: floorNo } },
        create: { hotelId, number: floorNo, name: `${floorNo}. Kat` },
        update: {},
      });
      for (let i = 1; i <= plan.roomsPerFloor; i += 1) {
        const number = String(floorNo * 100 + i);
        const roomTypeId = i >= 9 && plan.code === "ROYAL" ? suite.id : standard.id;
        const extension = EXTENSIONS.get(number) ?? null;
        let room = await db.room.upsert({
          where: { hotelId_number: { hotelId, number } },
          create: { hotelId, floorId: floor.id, roomTypeId, number, extension },
          update: {},
        });
        if (!room.qrToken) {
          room = await db.room.update({ where: { id: room.id }, data: { qrToken: generateQrToken("ROOM", room.id), qrGeneratedAt: new Date() } });
        }
        rooms.push({ id: room.id, number, roomTypeId: room.roomTypeId ?? roomTypeId, floorNo });
      }
    }
    // Pool stock: plenty everywhere, one product at its critical level.
    for (const [code, productId] of catalog.products) {
      const critical = code === CRITICAL_PRODUCT;
      const existing = await db.hotelStock.findUnique({ where: { hotelId_productId: { hotelId, productId } }, select: { id: true } });
      if (existing) continue;
      await db.hotelStock.create({
        data: { hotelId, productId, totalQty: 120, usedQty: critical ? 100 : 0, remainingQty: critical ? 20 : 120, criticalLevel: 20 },
      });
      await db.hotelStockMovement.create({
        data: { hotelId, productId, userId: depoUserId, type: "GIRIS", qty: 120, note: "Eğitim açılış stoku" },
      });
    }
    worlds.push({ id: hotelId, code: plan.code, rooms });
  }
  return worlds;
}

// ───────────────────────────── outlets and menus ─────────────────────────────

async function ensureNode(
  db: PrismaClient,
  data: { outletId: string; parentId: string | null; kind: "KATEGORI" | "OGE"; name: string; sortOrder: number } & Partial<{
    price: number;
    imageUrl: string;
    allergens: string[];
    tags: string[];
    isAvailable: boolean;
  }>,
): Promise<string> {
  const found = await db.menuNode.findFirst({
    where: { outletId: data.outletId, parentId: data.parentId, kind: data.kind, name: data.name },
    select: { id: true },
  });
  if (found) return found.id;
  return (await db.menuNode.create({ data: { allergens: [], tags: [], ...data }, select: { id: true } })).id;
}

async function seedMenu(db: PrismaClient, outletId: string, categories: DemoCategory[]) {
  for (const [ci, category] of categories.entries()) {
    const categoryId = await ensureNode(db, { outletId, parentId: null, kind: "KATEGORI", name: category.n[0], sortOrder: ci });
    const nodes: [string, string[]][] = [[categoryId, category.n]];
    for (const [ii, item] of category.items.entries()) {
      const id = await ensureNode(db, {
        outletId,
        parentId: categoryId,
        kind: "OGE",
        name: item.n[0],
        sortOrder: ii,
        price: item.price,
        imageUrl: item.image ? `/menu-samples/${item.image}.webp` : undefined,
        allergens: item.allergens ?? [],
        tags: item.tags ?? [],
        isAvailable: !item.soldOut,
      });
      nodes.push([id, item.n]);
    }
    for (const [nodeId, names] of nodes) {
      for (const [li, lang] of TRANSLATION_LANGS.entries()) {
        await db.menuNodeTranslation.upsert({
          where: { nodeId_lang: { nodeId, lang } },
          create: { nodeId, lang, name: names[li + 1] },
          update: {},
        });
      }
    }
  }
}

interface OutletWorld {
  id: string;
  name: string;
  tables: { id: string; number: number; label: string }[];
  /** Orderable menu items. */
  items: { id: string; name: string; price: number }[];
}

async function seedOutlets(db: PrismaClient, hotelId: string, userIds: Map<string, string>) {
  const { generateQrToken } = await import("../src/lib/qr");
  const themes = await db.menuTheme.findMany({ orderBy: { name: "asc" }, take: 2, select: { id: true } });
  const worlds = new Map<string, OutletWorld>();

  const loadItems = async (outletId: string) =>
    (
      await db.menuNode.findMany({
        where: { outletId, kind: "OGE", isActive: true, isAvailable: true, price: { not: null } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    ).map((n) => ({ id: n.id, name: n.name, price: Number(n.price) }));

  for (const [index, def] of DEMO_OUTLETS.entries()) {
    let outlet = await db.outlet.findFirst({ where: { hotelId, name: def.name }, select: { id: true } });
    if (!outlet) {
      outlet = await db.outlet.create({
        data: { hotelId, name: def.name, type: def.type as OutletType, hasMenu: true, hasOrdering: true, orderingEnabled: true, kdsEnabled: true },
        select: { id: true },
      });
      await ensureDefaultCallOptions(db, outlet.id);
    }
    const theme = themes[index];
    if (theme) await db.outlet.updateMany({ where: { id: outlet.id, themeId: null }, data: { themeId: theme.id } });

    const areaType = def.type === "SALON" ? "KAPALI" : "ACIK";
    const areaName = "Eğitim alanı";
    const area =
      (await db.outletAreaDefinition.findFirst({ where: { outletId: outlet.id, type: areaType, name: areaName }, select: { id: true } })) ??
      (await db.outletAreaDefinition.create({
        data: { outletId: outlet.id, type: areaType, name: areaName, orderingEnabled: true },
        select: { id: true },
      }));
    const tables: OutletWorld["tables"] = [];
    for (let number = 1; number <= 10; number += 1) {
      const label = `M${number}`;
      let table = await db.outletTable.findFirst({ where: { outletId: outlet.id, OR: [{ number }, { label }] } });
      table ??= await db.outletTable.create({ data: { outletId: outlet.id, areaId: area.id, number, label, capacity: [2, 4, 4, 6][number % 4] } });
      if (!table.qrToken) {
        table = await db.outletTable.update({ where: { id: table.id }, data: { qrToken: generateQrToken("TABLE", table.id) } });
      }
      tables.push({ id: table.id, number: table.number ?? number, label: table.label });
    }
    await seedMenu(db, outlet.id, def.menu);
    worlds.set(def.name, { id: outlet.id, name: def.name, tables, items: await loadItems(outlet.id) });
  }

  // The base seed creates the hotel's room service outlet; the demo only adds its menu.
  const roomService = await db.outlet.findFirst({ where: { hotelId, type: "ODA_SERVISI" }, select: { id: true } });
  if (!roomService) throw new Error("Oda Servisi outleti yok; önce temel seed çalıştırılmalı (npm run db:seed)");
  await seedMenu(db, roomService.id, DEMO_ROOM_SERVICE_MENU);
  worlds.set("Oda Servisi", { id: roomService.id, name: "Oda Servisi", tables: [], items: await loadItems(roomService.id) });

  // Memberships and table assignments.
  const pool = worlds.get("Havuz Bar")!;
  const beach = worlds.get("Beach Bar")!;
  const main = worlds.get("Ana Restoran")!;
  const room = worlds.get("Oda Servisi")!;
  const outletsFor = (scope: DemoUser["outlets"]): OutletWorld[] =>
    scope === "all" ? [pool, beach, main, room] : scope === "pool" ? [pool] : scope === "pool+beach" ? [pool, beach] : scope === "room" ? [room] : [];
  for (const u of DEMO_USERS) {
    const userId = userIds.get(u.username)!;
    for (const outlet of outletsFor(u.outlets)) {
      await db.outletMember.upsert({
        where: { userId_outletId: { userId, outletId: outlet.id } },
        create: { userId, outletId: outlet.id },
        update: {},
      });
    }
  }
  const assign: [string, OutletWorld, number, number][] = [
    ["egitim.garson1", pool, 1, 4],
    ["egitim.garson2", pool, 5, 8],
    ["egitim.garson3", beach, 1, 5],
    ["egitim.garson3", main, 1, 5],
  ];
  for (const [username, outlet, from, to] of assign) {
    const userId = userIds.get(username)!;
    for (const table of outlet.tables.filter((t) => t.number >= from && t.number <= to)) {
      const existing = await db.tableAssignment.findFirst({ where: { tableId: table.id, isActive: true }, select: { id: true } });
      if (!existing) await db.tableAssignment.create({ data: { outletId: outlet.id, tableId: table.id, userId } });
    }
  }

  // Documentation printer (inactive, TEST-NET address) with a failed test slip example; nothing is ever sent.
  const printer = await db.printer.upsert({
    where: { hotelId_name: { hotelId, name: "Eğitim Fiş Yazıcısı" } },
    create: { hotelId, outletId: pool.id, name: "Eğitim Fiş Yazıcısı", ip: "192.0.2.50", isActive: false },
    update: {},
  });
  if (!(await db.printJob.findFirst({ where: { printerId: printer.id, kind: "TEST" }, select: { id: true } }))) {
    await db.printJob.create({
      data: {
        hotelId,
        printerId: printer.id,
        kind: "TEST",
        status: "HATA",
        attempts: 3,
        error: "Eğitim örneği: yazıcı pasif",
        payload: { text: "TEST FİŞİ — EĞİTİM ÖRNEĞİ" },
      },
    });
  }

  // One open waiter call at Havuz Bar M3.
  const m3 = pool.tables.find((t) => t.number === 3)!;
  if (!(await db.waiterCall.findFirst({ where: { tableId: m3.id, status: "ACIK" }, select: { id: true } }))) {
    await db.waiterCall.create({ data: { outletId: pool.id, tableId: m3.id, type: "GARSON", note: "Eğitim örneği çağrı" } });
  }
  return worlds;
}

// ───────────────────────────── day-relative data ─────────────────────────────

/** Occupancy plan for `rooms` (rotated by the day index so the picture changes day to day). */
function partition<T>(rooms: T[], dayIdx: number) {
  const n = rooms.length;
  const rotated = rooms.map((_, i) => rooms[(i + dayIdx * 3) % n]);
  const clash = n >= 10 ? 2 : 0;
  const arrival = Math.round(n * 0.2);
  const inhouse = Math.round(n * 0.4);
  const departure = Math.round(n * 0.17);
  let cursor = 0;
  const take = (count: number) => rotated.slice(cursor, (cursor += count));
  return { clash: take(clash), arrival: take(arrival), inhouse: take(inhouse), departure: take(departure) };
}

async function seedHotelDay(
  db: PrismaClient,
  world: HotelWorld,
  day: string,
  dayIdx: number,
  isToday: boolean,
  catalog: Catalog,
  users: Map<string, string>,
) {
  const batchCode = `DEMO-${day}`;
  const dayValue = businessDay(day);
  const plan = partition(world.rooms, dayIdx);
  const kat = [users.get("egitim.kat1")!, users.get("egitim.kat2")!];
  const done: TaskStatus = isToday ? "BEKLIYOR" : "TAMAMLANDI";

  const task = async (type: "INHOUSE_KONTROL" | "ARRIVAL_KONTROL" | "DEPARTURE_KONTROL") =>
    db.dailyTask.upsert({
      where: { hotelId_date_type: { hotelId: world.id, date: dayValue, type } },
      create: {
        hotelId: world.id,
        date: dayValue,
        type,
        status: isToday ? "BEKLIYOR" : "TAMAMLANDI",
        completedAt: isToday ? null : at(day, 18),
      },
      update: {},
    });
  const inhouseTask = await task("INHOUSE_KONTROL");
  const arrivalTask = await task("ARRIVAL_KONTROL");
  const departureTask = await task("DEPARTURE_KONTROL");

  if ((await db.guestRecord.count({ where: { hotelId: world.id, batchCode } })) > 0) return;

  const record = (
    roomId: string,
    kind: "IN_HOUSE" | "ARRIVAL" | "DEPARTURE",
    arrive: number,
    depart: number,
    times: { arrivalTime?: string; departureTime?: string } = {},
  ) =>
    db.guestRecord.create({
      data: {
        hotelId: world.id,
        roomId,
        batchCode,
        guestCount: 2,
        kind,
        arrivalDate: businessDay(shiftDay(day, arrive)),
        departureDate: businessDay(shiftDay(day, depart)),
        ...times,
      },
      select: { id: true },
    });
  const item = (taskId: string, guestRecordId: string, data: Omit<Prisma.DailyTaskItemUncheckedCreateInput, "taskId" | "guestRecordId">) =>
    db.dailyTaskItem.upsert({
      where: { taskId_roomId: { taskId, roomId: data.roomId } },
      create: { ...data, taskId, guestRecordId },
      update: {},
      select: { id: true },
    });

  for (const room of plan.clash) {
    const dep = await record(room.id, "DEPARTURE", -3, 0, { departureTime: "11:30" });
    const arr = await record(room.id, "ARRIVAL", 0, 4, { arrivalTime: "13:30" });
    await item(departureTask.id, dep.id, { roomId: room.id, status: done, priority: 1, departureTime: "11:30" });
    await item(arrivalTask.id, arr.id, {
      roomId: room.id,
      status: done,
      priority: 1,
      arrivalTime: "13:30",
      departureTime: "11:30",
      note: "Aynı gün çıkış ve giriş çakışması",
    });
  }
  for (const [i, room] of plan.arrival.entries()) {
    const time = `${12 + (i % 5)}:00`;
    const rec = await record(room.id, "ARRIVAL", 0, 3, { arrivalTime: time });
    await item(arrivalTask.id, rec.id, { roomId: room.id, status: done, priority: 2, arrivalTime: time });
  }
  for (const [i, room] of plan.departure.entries()) {
    const time = `${10 + (i % 3)}:00`;
    const rec = await record(room.id, "DEPARTURE", -5, 0, { departureTime: time });
    await item(departureTask.id, rec.id, { roomId: room.id, status: done, priority: 3, departureTime: time });
  }

  const sku = (code: string) => catalog.products.get(code)!;
  for (const [i, room] of plan.inhouse.entries()) {
    const rec = await record(room.id, "IN_HOUSE", -2, 2);
    const dnd = i === 3; // this room is "do not disturb" today and was on two earlier days
    const status: TaskStatus = isToday ? (dnd ? "DND_BEKLIYOR" : i < 4 ? "TAMAMLANDI" : "BEKLIYOR") : "TAMAMLANDI";
    const checked = status === "TAMAMLANDI";
    const taskItem = await item(inhouseTask.id, rec.id, {
      roomId: room.id,
      status,
      priority: 4,
      dndCount: dnd && isToday ? 1 : 0,
      lastDndAt: dnd && isToday ? at(day, 11) : null,
      checkedAt: checked ? at(day, 10, i * 7) : null,
    });
    if (checked && !dnd) {
      // A completed minibar control: some consumption, refilled to the setup quantity.
      const userId = kat[i % 2];
      const consumed: [string, number][] = [
        ["DEMO-SU", 1 + (i % 3)],
        ["DEMO-KOLA", i % 2],
        ["DEMO-CIKOLATA", (i + dayIdx) % 2],
      ];
      const tx = await db.minibarTransaction.create({
        data: {
          hotelId: world.id,
          roomId: room.id,
          userId,
          type: "SETUP_KONTROL",
          clientRequestId: `demo-mb-${world.code}-${day}-${room.number}`,
          occurredAt: at(day, 10, i * 7),
          items: {
            create: consumed
              .filter(([, qty]) => qty > 0)
              .map(([code, qty]) => ({
                productId: sku(code),
                setupId: catalog.setups.get(code === "DEMO-CIKOLATA" ? "DEMO ATIŞTIRMA" : "DEMO MINI"),
                setupQty: 4,
                startStock: 4 - qty,
                endStock: 4,
                consumed: qty,
                added: qty,
                salePrice: MINIBAR_PRODUCTS.find((p) => p.code === code)!.price,
              })),
          },
        },
        select: { id: true },
      });
      await db.roomCheck.create({
        data: {
          roomId: room.id,
          userId,
          transactionId: tx.id,
          checkDate: dayValue,
          startedAt: at(day, 10, i * 7),
          endedAt: at(day, 10, i * 7 + 4),
          type: "URUN_EKLENDI",
        },
      });
    }
    if (dnd && world.code === "ROYAL" && (isToday || dayIdx === 1 || dayIdx === 3)) {
      const rowDnd = await db.roomDnd.upsert({
        where: { roomId_date: { roomId: room.id, date: dayValue } },
        create: {
          hotelId: world.id,
          roomId: room.id,
          date: dayValue,
          count: isToday ? 1 : 2,
          firstAt: at(day, 11),
          lastAt: at(day, isToday ? 11 : 15),
          status: isToday ? "AKTIF" : "TAMAMLANDI",
          taskItemId: taskItem.id,
        },
        update: {},
      });
      if (!isToday) {
        await db.roomDndCheck.create({
          data: { dndId: rowDnd.id, no: 1, userId: kat[0], at: at(day, 15), note: "Eğitim örneği: oda tekrar kontrol edildi" },
        });
      }
    }
  }

  // MyBar requests (ROYAL): one pending today, completed ones on two earlier days.
  if (world.code === "ROYAL" && (isToday || dayIdx === 2 || dayIdx === 4)) {
    const key = `demo-mybar-${day}`;
    const room = plan.inhouse[5] ?? plan.inhouse[0];
    if (room && !(await db.mybarRequest.findUnique({ where: { idempotencyKey: key }, select: { id: true } }))) {
      const open = isToday;
      const req = await db.mybarRequest.create({
        data: {
          hotelId: world.id,
          roomId: room.id,
          businessDate: dayValue,
          status: open ? "BEKLEMEDE" : "TAMAMLANDI",
          language: "tr",
          clientIp: "127.0.0.1",
          idempotencyKey: key,
          note: "Ekstra soğuk su ve çikolata rica ediyoruz.",
          createdAt: at(day, 9, 30),
          ...(open ? {} : { completedById: kat[0], completedAt: at(day, 10, 15), seenById: kat[0], seenAt: at(day, 9, 45) }),
        },
        select: { id: true },
      });
      for (const [code, qty] of [["DEMO-SU", 3], ["DEMO-CIKOLATA", 2]] as const) {
        await db.mybarRequestItem.create({ data: { requestId: req.id, productId: sku(code), requestedQty: qty, deliveredQty: open ? 0 : qty } });
      }
    }
  }
}

const TABLE_FLOW: OrderStatus[] = ["GONDERILDI", "ONAYLANDI", "HAZIR", "SERVIS_EDILDI"];
const ROOM_FLOW: OrderStatus[] = ["GONDERILDI", "ONAYLANDI", "HAZIR", "YOLDA", "TESLIM_EDILDI"];

async function seedOrders(
  db: PrismaClient,
  hotel: HotelWorld,
  outlets: Map<string, OutletWorld>,
  day: string,
  dayIdx: number,
  isToday: boolean,
  users: Map<string, string>,
) {
  const dayValue = businessDay(day);
  const waiter = users.get("egitim.garson1")!;
  const kitchen = users.get("egitim.mutfak")!;
  const roomStaff = users.get("egitim.oda")!;
  const slots: { outlet: string; kind: "MASA" | "ODA_SERVISI"; target: OrderStatus }[] = [
    { outlet: "Havuz Bar", kind: "MASA", target: isToday ? "GONDERILDI" : "SERVIS_EDILDI" },
    { outlet: "Havuz Bar", kind: "MASA", target: isToday ? "ONAYLANDI" : "SERVIS_EDILDI" },
    { outlet: "Beach Bar", kind: "MASA", target: isToday ? "HAZIR" : dayIdx === 2 ? "IPTAL" : "SERVIS_EDILDI" },
    { outlet: "Ana Restoran", kind: "MASA", target: "SERVIS_EDILDI" },
    { outlet: "Oda Servisi", kind: "ODA_SERVISI", target: isToday ? "YOLDA" : "TESLIM_EDILDI" },
  ];
  if (dayIdx % 2 === 1) slots.push({ outlet: "Havuz Bar", kind: "MASA", target: "SERVIS_EDILDI" });

  const roomsWithLine = hotel.rooms.filter((r) => r.floorNo === 1).slice(0, 4);
  for (const [si, slot] of slots.entries()) {
    const key = `demo-ord-${day}-${si}`;
    if (await db.order.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) continue;
    const outlet = outlets.get(slot.outlet)!;
    if (outlet.items.length === 0) continue;
    const count = 1 + ((si + dayIdx) % 3);
    const lines = Array.from({ length: count }, (_, k) => ({ it: outlet.items[(si + dayIdx + k) % outlet.items.length], qty: 1 + ((si + k) % 2) }));
    const subtotal = lines.reduce((sum, l) => sum + l.it.price * l.qty, 0);
    const full = slot.kind === "MASA" ? TABLE_FLOW : ROOM_FLOW;
    const flow: OrderStatus[] = slot.target === "IPTAL" ? ["GONDERILDI", "IPTAL"] : full.slice(0, full.indexOf(slot.target) + 1);
    const created = at(day, 12 + si, 5 * dayIdx);
    const when = (status: OrderStatus): Date => new Date(created.getTime() + flow.indexOf(status) * 4 * 60_000);
    const reached = (status: OrderStatus) => flow.includes(status);
    const table = slot.kind === "MASA" ? outlet.tables[(si + dayIdx) % 4] : null;
    const room = slot.kind === "ODA_SERVISI" ? roomsWithLine[dayIdx % roomsWithLine.length] : null;
    const staff = slot.kind === "MASA" ? waiter : roomStaff;

    const counter = await db.orderCounter.upsert({
      where: { hotelId_businessDate: { hotelId: hotel.id, businessDate: dayValue } },
      create: { hotelId: hotel.id, businessDate: dayValue, lastNo: 1 },
      update: { lastNo: { increment: 1 } },
    });
    await db.order.create({
      data: {
        hotelId: hotel.id,
        outletId: outlet.id,
        kind: slot.kind,
        tableId: table?.id ?? null,
        roomId: room?.id ?? null,
        businessDate: dayValue,
        orderNo: counter.lastNo,
        status: slot.target,
        guestLanguage: si % 3 === 2 ? "en" : "tr",
        pricesShown: true,
        subtotal: subtotal.toFixed(2),
        idempotencyKey: key,
        clientIp: "127.0.0.1",
        createdAt: created,
        approvedById: reached("ONAYLANDI") ? staff : null,
        approvedAt: reached("ONAYLANDI") ? when("ONAYLANDI") : null,
        readyAt: reached("HAZIR") ? when("HAZIR") : null,
        servedAt: reached("SERVIS_EDILDI") ? when("SERVIS_EDILDI") : null,
        servedById: reached("SERVIS_EDILDI") ? waiter : null,
        onWayAt: reached("YOLDA") ? when("YOLDA") : null,
        deliveredAt: reached("TESLIM_EDILDI") ? when("TESLIM_EDILDI") : null,
        deliveredById: reached("TESLIM_EDILDI") ? roomStaff : null,
        cancelledAt: reached("IPTAL") ? when("IPTAL") : null,
        assignedWaiterId: slot.kind === "MASA" ? waiter : null,
        items: { create: lines.map((l) => ({ menuNodeId: l.it.id, nameSnapshot: l.it.name, qty: l.qty, unitPrice: l.it.price.toFixed(2) })) },
        events: {
          create: flow.map((status, k) => ({
            from: k === 0 ? null : flow[k - 1],
            to: status,
            userId: k === 0 ? null : k === 2 ? kitchen : staff,
            at: when(status),
          })),
        },
      },
    });
  }
}

// ───────────────────────────── entry points ─────────────────────────────

export interface RunDemoOptions {
  /** Reference instant for "today" (tests move it forward a day). */
  today?: Date;
}

/** Loads the training world. Refuses any database whose name is not a training one, and a missing/short DEMO_PASSWORD. */
export async function runDemoSeed(db: PrismaClient, opts: RunDemoOptions = {}): Promise<DemoSummary> {
  const rows = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const database = rows[0]?.name ?? "";
  assertTrainingDatabase(database);
  const password = requireDemoPassword();

  const hotels = await db.hotel.findMany({ where: { code: { in: HOTEL_PLANS.map((p) => p.code) } }, select: { id: true, code: true } });
  const hotelIds = new Map(hotels.map((h) => [h.code, h.id]));
  if (!hotelIds.has("ROYAL")) throw new Error("Oteller yok; önce temel seed çalıştırılmalı (npm run db:seed)");

  const today = businessDate(opts.today ?? new Date());
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDay(today, i - (HISTORY_DAYS - 1)));

  const users = await seedUsers(db, password, hotelIds);
  const catalog = await seedMinibarCatalog(db);
  const worlds = await seedRooms(db, hotelIds, catalog, users.get("egitim.depo")!);
  const outlets = await seedOutlets(db, hotelIds.get("ROYAL")!, users);
  const royal = worlds.find((w) => w.code === "ROYAL")!;

  for (const [dayIdx, day] of days.entries()) {
    const isToday = day === today;
    for (const world of worlds) await seedHotelDay(db, world, day, dayIdx, isToday, catalog, users);
    await seedOrders(db, royal, outlets, day, dayIdx, isToday, users);
  }

  const hotelFilter = { hotelId: { in: worlds.map((w) => w.id) } };
  const outletIds = [...outlets.values()].map((o) => o.id);
  return {
    database,
    today,
    hotels: worlds.map((w) => w.code),
    floors: await db.floor.count({ where: hotelFilter }),
    rooms: await db.room.count({ where: hotelFilter }),
    products: MINIBAR_PRODUCTS.length,
    outlets: outlets.size,
    tables: await db.outletTable.count({ where: { outletId: { in: outletIds } } }),
    menuItems: await db.menuNode.count({ where: { outletId: { in: outletIds }, kind: "OGE" } }),
    users: DEMO_USERS.map((u) => ({ username: u.username, role: u.role })),
    orders: await db.order.count({ where: { idempotencyKey: { startsWith: "demo-ord-" } } }),
    mybarRequests: await db.mybarRequest.count({ where: { idempotencyKey: { startsWith: "demo-mybar-" } } }),
    dnds: await db.roomDnd.count({ where: hotelFilter }),
    dailyTasks: await db.dailyTask.count({ where: hotelFilter }),
    guestRecords: await db.guestRecord.count({ where: { ...hotelFilter, batchCode: { startsWith: "DEMO-" } } }),
    minibarTransactions: await db.minibarTransaction.count({ where: { clientRequestId: { startsWith: "demo-mb-" } } }),
  };
}

/** Human-readable summary; contains no secrets (logins are listed without the password). */
export function formatSummary(s: DemoSummary): string {
  return [
    `Eğitim verisi hazır — veritabanı ${s.database}, bugün ${s.today}`,
    `Oteller: ${s.hotels.join(", ")} | kat ${s.floors}, oda ${s.rooms}, outlet ${s.outlets}, masa ${s.tables}, menü öğesi ${s.menuItems}`,
    `Günlük görev ${s.dailyTasks}, konaklama kaydı ${s.guestRecords}, minibar işlemi ${s.minibarTransactions}, MyBar ${s.mybarRequests}, DND ${s.dnds}, sipariş ${s.orders}`,
    `Girişler (parola: DEMO_PASSWORD ortam değişkeni): ${s.users.map((u) => `${u.username} (${u.role})`).join(", ")}`,
  ].join("\n");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL tanımlı değil");
  assertTrainingDatabase(databaseNameFromUrl(url)); // refuse before connecting
  const { prisma } = await import("@/lib/prisma");
  try {
    console.log(formatSummary(await runDemoSeed(prisma)));
  } finally {
    await prisma.$disconnect();
  }
}

if (/^seed-demo\.[cm]?[jt]s$/.test(path.basename(process.argv[1] ?? ""))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
