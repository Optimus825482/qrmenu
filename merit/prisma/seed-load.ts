import "dotenv/config";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { assertSafeTarget } from "../tools/load/src/guard";
import { targetSchema, type Targets } from "../tools/load/src/targets";
import { runSeed } from "./seed";

/** Synthetic load world. No resets; natural keys make repeated provisioning safe. */
export async function runLoadSeed(db: PrismaClient): Promise<Targets> {
  const baseUrl = process.env.LOAD_BASE_URL ?? "http://localhost:3124";
  assertSafeTarget(baseUrl, process.env.DATABASE_URL);
  const password = process.env.LOAD_PASSWORD;
  if (!password || password.length < 10) throw new Error("LOAD_PASSWORD en az 10 karakter olmalı");
  const [actual] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (actual.name !== decodeURIComponent(new URL(process.env.DATABASE_URL!).pathname.slice(1))) throw new Error("Seed DB hedefi eşleşmiyor");
  await runSeed(db, { legacyDefinitions: false });
  const { generateQrToken } = await import("../src/lib/qr");
  const hotel = await db.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } });
  await db.hotelModule.updateMany({ where: { hotelId: hotel.id }, data: { enabled: true } });
  const theme = await db.menuTheme.findFirstOrThrow();
  const tables: Targets["tables"] = [];
  const outlets: { id: string; tables: string[] }[] = [];
  for (let n = 1; n <= 3; n++) {
    const outlet = await db.outlet.upsert({ where: { hotelId_name: { hotelId: hotel.id, name: `Yük Bar ${n}` } }, create: { hotelId: hotel.id, name: `Yük Bar ${n}`, type: "BAR", hasMenu: true, hasOrdering: true, kdsEnabled: true, themeId: theme.id }, update: {} });
    let area = await db.outletAreaDefinition.findFirst({ where: { outletId: outlet.id } });
    area ??= await db.outletAreaDefinition.create({ data: { outletId: outlet.id, type: "KAPALI", name: "Yük Alanı" } });
    const category = await db.menuNode.upsert({ where: { id: `load-cat-${n}` }, create: { id: `load-cat-${n}`, outletId: outlet.id, kind: "KATEGORI", name: "Yük İçecekleri" }, update: {} });
    let firstItem = "";
    for (let item = 1; item <= 8; item++) {
      const node = await db.menuNode.upsert({ where: { id: `load-item-${n}-${item}` }, create: { id: `load-item-${n}-${item}`, outletId: outlet.id, parentId: category.id, kind: "OGE", name: `Yük İçeceği ${item}`, price: "2.50" }, update: {} });
      firstItem ||= node.id;
    }
    const tableIds: string[] = [];
    for (let t = 1; t <= 40; t++) {
      let table = await db.outletTable.upsert({ where: { outletId_label: { outletId: outlet.id, label: `Y${t}` } }, create: { outletId: outlet.id, areaId: area.id, number: t, label: `Y${t}` }, update: {} });
      if (!table.qrToken) table = await db.outletTable.update({ where: { id: table.id }, data: { qrToken: generateQrToken("TABLE", table.id) } });
      tables.push({ token: table.qrToken!, outletId: outlet.id, menuNodeId: firstItem }); tableIds.push(table.id);
    }
    outlets.push({ id: outlet.id, tables: tableIds });
  }
  const rs = await db.outlet.findFirstOrThrow({ where: { hotelId: hotel.id, type: "ODA_SERVISI" } });
  await db.outlet.update({ where: { id: rs.id }, data: { hasMenu: true, hasOrdering: true, orderingEnabled: true, phoneConfirmRequired: false, themeId: theme.id } });
  const rsItem = await db.menuNode.upsert({ where: { id: "load-rs-item" }, create: { id: "load-rs-item", outletId: rs.id, kind: "OGE", name: "Yük Sandviç", price: "5" }, update: {} });
  const floor = await db.floor.upsert({ where: { hotelId_number: { hotelId: hotel.id, number: 99 } }, create: { hotelId: hotel.id, number: 99, name: "Yük Katı" }, update: {} });
  const roomType = await db.roomType.upsert({ where: { hotelId_name: { hotelId: hotel.id, name: "Yük Odası" } }, create: { hotelId: hotel.id, name: "Yük Odası", cabinetCount: 1 }, update: {} });
  const rooms: Targets["rooms"] = [];
  for (let i = 1; i <= 60; i++) {
    let room = await db.room.upsert({ where: { hotelId_number: { hotelId: hotel.id, number: `Y${i}` } }, create: { hotelId: hotel.id, floorId: floor.id, roomTypeId: roomType.id, number: `Y${i}` }, update: {} });
    if (!room.qrToken) room = await db.room.update({ where: { id: room.id }, data: { qrToken: generateQrToken("ROOM", room.id) } });
    rooms.push({ token: room.qrToken!, menuNodeId: rsItem.id });
  }
  const hash = await bcrypt.hash(password, 12);
  const staff: Targets["staff"] = [];
  const definitions = [{ role: "kasa", code: "R-KAS", count: 4 }, { role: "kds", code: "R-KDS", count: 4 }, { role: "garson", code: "R-GAR", count: 12 }, { role: "oda", code: "R-ODS", count: 6 }, { role: "kat", code: "R-KAT", count: 6 }, { role: "depo", code: "R-DEP", count: 3 }, { role: "fbm", code: "R-FBM", count: 2 }, { role: "admin", code: "R-OTM", count: 3 }, { role: "radar", code: "R-OTM", count: 5 }];
  for (const def of definitions) {
    const role = await db.role.findUniqueOrThrow({ where: { code: def.code } });
    for (let i = 1; i <= def.count; i++) {
      const username = `yuk.${def.role}${i}`;
      const user = await db.user.upsert({ where: { username }, create: { username, fullName: `Yük ${def.role} ${i}`, email: `${username}@example.invalid`, roleId: role.id, hotelId: hotel.id, passwordHash: hash }, update: { passwordHash: hash, isActive: true } });
      const assignedOutlet = outlets[(i - 1) % outlets.length];
      const membership = def.role === "oda" ? rs.id : assignedOutlet.id;
      staff.push({ username, role: def.role, outletId: membership, outletName: def.role === "oda" ? rs.name : `Yük Bar ${(i - 1) % outlets.length + 1}` });
      if (["kasa", "kds", "garson", "oda", "fbm"].includes(def.role)) {
        await db.outletMember.upsert({ where: { userId_outletId: { userId: user.id, outletId: membership } }, create: { userId: user.id, outletId: membership }, update: {} });
      }
      if (def.role === "garson" && i <= 3) for (const outlet of [assignedOutlet]) {
        await db.outletMember.upsert({ where: { userId_outletId: { userId: user.id, outletId: outlet.id } }, create: { userId: user.id, outletId: outlet.id }, update: {} });
        for (const tableId of outlet.tables) {
          const assignment = await db.tableAssignment.findFirst({ where: { tableId, isActive: true } });
          if (assignment) await db.tableAssignment.update({ where: { id: assignment.id }, data: { userId: user.id } });
          else await db.tableAssignment.create({ data: { outletId: outlet.id, tableId, userId: user.id } });
        }
      }
    }
  }
  // Ensure the smoke mix contains each active order persona before the remaining staff.
  staff.sort((a: Targets["staff"][number], b: Targets["staff"][number]) => Number(b.username.endsWith("1")) - Number(a.username.endsWith("1")));
  const result = targetSchema.parse({ baseUrl, tables, rooms, staff });
  const dir = path.resolve("tools/load/.tmp"); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "targets.json"), JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  return result;
}

if (/^seed-load\.[cm]?[jt]s$/.test(path.basename(process.argv[1] ?? ""))) {
  void (async () => {
    assertSafeTarget(process.env.LOAD_BASE_URL ?? "http://localhost:3124", process.env.DATABASE_URL);
    const { prisma } = await import("../src/lib/prisma");
    try { const t = await runLoadSeed(prisma); console.log(`Yük seed: ${t.tables.length} masa, ${t.rooms.length} oda, ${t.staff.length} personel (5 radar dahil)`); }
    finally { await prisma.$disconnect(); }
  })().catch(() => { console.error("Yük seed başarısız; hedef, şema ve parola ortamını kontrol edin"); process.exitCode = 1; });
}
