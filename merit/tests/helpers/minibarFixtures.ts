import { randomUUID } from "node:crypto";
import type { Ctx } from "@/lib/auth";
import { generateQrToken } from "@/lib/qr";
import { testDb } from "./db";
import { ctxFor, hotelId, makeUser } from "./fixtures";

const uniq = (p: string) => `${p}-${randomUUID().slice(0, 8)}`;

/** Removes everything the minibar fixtures create (CASCADE also clears movements, checks, requests). */
export async function resetMinibarData(): Promise<void> {
  await testDb.$executeRawUnsafe(
    `TRUNCATE TABLE "daily_tasks", "guest_records", "occupancy_uploads", "upload_tasks", "room_dnds", "rooms", "floors", "room_types", "products", "product_groups", "setups", "email_logs", "notifications", "audit_logs" RESTART IDENTITY CASCADE`,
  );
  await testDb.setting.deleteMany({ where: { hotelId: { not: null } } });
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
}

/**
 * A hotel with one floor, a room type with a setup (cola x`setupQty`, water x`setupQty`),
 * `rooms` rooms using it (each with a signed QR token) and pool stock for both products.
 */
export async function minibarWorld(
  opts: { hotelCode?: string; setupQty?: number; stock?: number; rooms?: number } = {},
) {
  const code = opts.hotelCode ?? "ROYAL";
  const hid = await hotelId(code);
  const setupQty = opts.setupQty ?? 4;
  const stock = opts.stock ?? 100;

  const floor = await testDb.floor.create({
    data: { hotelId: hid, number: Math.floor(Math.random() * 900_000) + 1, name: uniq("Kat") },
  });
  const roomType = await testDb.roomType.create({ data: { hotelId: hid, name: uniq("RT") } });
  const group = await testDb.productGroup.create({ data: { name: uniq("Grup") } });
  const cola = await testDb.product.create({
    data: { groupId: group.id, name: uniq("Kola"), purchasePrice: "2.00", salePrice: "3.50" },
  });
  const water = await testDb.product.create({
    data: { groupId: group.id, name: uniq("Su"), purchasePrice: "0.50", salePrice: "1.00" },
  });
  const setup = await testDb.setup.create({
    data: {
      name: uniq("Setup"),
      items: {
        create: [
          { productId: cola.id, qty: setupQty },
          { productId: water.id, qty: setupQty },
        ],
      },
    },
  });
  await testDb.roomTypeSetup.create({ data: { hotelId: hid, roomTypeId: roomType.id, setupId: setup.id } });

  for (const p of [cola, water]) {
    await testDb.hotelStock.create({
      data: { hotelId: hid, productId: p.id, totalQty: stock, remainingQty: stock },
    });
  }

  const rooms = [];
  for (let i = 0; i < (opts.rooms ?? 1); i++) {
    const created = await testDb.room.create({
      data: { hotelId: hid, floorId: floor.id, roomTypeId: roomType.id, number: uniq("R") },
    });
    const room = await testDb.room.update({
      where: { id: created.id },
      data: { qrToken: generateQrToken("ROOM", created.id) },
    });
    rooms.push(room);
  }

  return { hotelId: hid, hotelCode: code, floor, roomType, group, cola, water, setup, rooms, room: rooms[0] };
}

export type MinibarWorld = Awaited<ReturnType<typeof minibarWorld>>;

/** A staff context for a seeded role in `hotelCode` (optionally also bound to other hotels). */
export async function staff(
  roleCode: string,
  hotelCode = "ROYAL",
  extraHotelCodes: string[] = [],
): Promise<{ userId: string; ctx: Ctx }> {
  const user = await makeUser({
    username: uniq(roleCode.toLowerCase()),
    roleCode,
    hotelCode,
    extraHotelCodes,
  });
  return { userId: user.id, ctx: await ctxFor(user, { hotelCode, extraHotelCodes }) };
}

export async function stockOf(hid: string, productId: string) {
  return testDb.hotelStock.findUniqueOrThrow({ where: { hotelId_productId: { hotelId: hid, productId } } });
}
