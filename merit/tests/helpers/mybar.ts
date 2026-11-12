import { randomUUID } from "node:crypto";
import type { MybarRequest, MybarStatus } from "@/generated/prisma/client";
import { generateQrToken } from "@/lib/qr";
import { businessDate, businessDay } from "@/lib/time";
import { testDb } from "./db";
import { hotelId } from "./fixtures";

const uniq = (p: string) => `${p}-${randomUUID().slice(0, 8)}`;

export type MybarFixture = {
  hotelId: string;
  floorId: string;
  roomId: string;
  roomNumber: string;
  roomToken: string;
  groupId: string;
  products: { su: string; kola: string; bira: string };
  setupId: string;
  roomTypeId: string;
};

export async function makeMybarFixture(opts: {
  hotelCode: string;
  setupQty?: number;
  stock?: number;
  roomNumber?: string;
}): Promise<MybarFixture> {
  const hid = await hotelId(opts.hotelCode);
  const setupQty = opts.setupQty ?? 2;
  const stock = opts.stock ?? 100;

  const floor = await testDb.floor.create({
    data: { hotelId: hid, number: Math.floor(Math.random() * 900_000) + 1, name: uniq("Kat") },
  });
  const roomType = await testDb.roomType.create({
    data: { hotelId: hid, name: uniq("Standart-RT") },
  });
  const group = await testDb.productGroup.create({
    data: { name: uniq("İçecek") },
  });

  const su = await testDb.product.create({
    data: { groupId: group.id, name: "Su 0.5L", purchasePrice: "0.50", salePrice: "1.00" },
  });
  const kola = await testDb.product.create({
    data: { groupId: group.id, name: "Kola", purchasePrice: "2.00", salePrice: "3.50" },
  });
  const bira = await testDb.product.create({
    data: { groupId: group.id, name: "Bira", purchasePrice: "3.00", salePrice: "5.00" },
  });

  const setup = await testDb.setup.create({
    data: {
      name: uniq("Standart"),
      items: {
        create: [
          { productId: su.id, qty: setupQty },
          { productId: kola.id, qty: setupQty },
          { productId: bira.id, qty: setupQty },
        ],
      },
    },
  });

  await testDb.roomTypeSetup.create({
    data: { hotelId: hid, roomTypeId: roomType.id, setupId: setup.id },
  });

  for (const p of [su, kola, bira]) {
    await testDb.hotelStock.create({
      data: { hotelId: hid, productId: p.id, totalQty: stock, remainingQty: stock },
    });
  }

  const roomNumber = opts.roomNumber ?? uniq("101");
  const createdRoom = await testDb.room.create({
    data: {
      hotelId: hid,
      floorId: floor.id,
      roomTypeId: roomType.id,
      number: roomNumber,
      guestMessage: null,
    },
  });
  const roomToken = generateQrToken("ROOM", createdRoom.id);
  const room = await testDb.room.update({
    where: { id: createdRoom.id },
    data: { qrToken: roomToken },
  });

  return {
    hotelId: hid,
    floorId: floor.id,
    roomId: room.id,
    roomNumber: room.number,
    roomToken,
    groupId: group.id,
    products: { su: su.id, kola: kola.id, bira: bira.id },
    setupId: setup.id,
    roomTypeId: roomType.id,
  };
}

export async function makeRequest(
  fx: MybarFixture,
  opts: {
    status?: MybarStatus;
    seen?: boolean;
    seenById?: string;
    items?: { productId: string; requested: number; delivered?: number }[];
    /** Setup products the guest asked to have taken out of the room. */
    removals?: { productId: string; requested: number; removed?: number }[];
    businessDate?: string;
    createdAt?: Date;
    completedAt?: Date;
    cancelledAt?: Date;
    note?: string;
    noteTr?: string;
  } = {},
): Promise<MybarRequest> {
  const status = opts.status ?? "BEKLEMEDE";
  const now = opts.createdAt ?? new Date();
  const bDate = businessDay(opts.businessDate ?? businessDate(now));
  const items = opts.items ?? [{ productId: fx.products.su, requested: 2, delivered: 0 }];
  const removals = opts.removals ?? [];

  return testDb.mybarRequest.create({
    data: {
      hotelId: fx.hotelId,
      roomId: fx.roomId,
      businessDate: bDate,
      status,
      language: "tr",
      note: opts.note ?? null,
      noteTr: opts.noteTr ?? null,
      seenAt: opts.seen ? now : null,
      seenById: opts.seenById ?? null,
      completedAt: status === "TAMAMLANDI" ? (opts.completedAt ?? now) : null,
      cancelledAt: status === "IPTAL" ? (opts.cancelledAt ?? now) : null,
      idempotencyKey: randomUUID(),
      clientIp: "10.0.0.1",
      createdAt: now,
      items: {
        create: items.map((it) => ({
          productId: it.productId,
          requestedQty: it.requested,
          deliveredQty: it.delivered ?? 0,
        })),
      },
      removals: {
        create: removals.map((it) => ({
          productId: it.productId,
          requestedQty: it.requested,
          removedQty: it.removed ?? 0,
        })),
      },
    },
  });
}
