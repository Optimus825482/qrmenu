import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";

/** Shape of prisma/seed/data/legacy-definitions.json (written by scripts/extract-legacy-definitions.ts). */
export interface LegacyDefinitions {
  source: string;
  extractedAt: string;
  hotels: Array<{
    code: string;
    name: string;
    isActive: boolean;
    logoUrl: string | null;
    floors: Array<{ number: number; name: string; isActive: boolean }>;
    roomTypes: Array<{ name: string; cabinetCount: number; isActive: boolean }>;
    rooms: Array<{
      number: string;
      floorNumber: number;
      roomType: string | null;
      capacity: number | null;
      guestMessage: string | null;
      isActive: boolean;
    }>;
    roomTypeSetups: Array<{ roomType: string; setup: string }>;
  }>;
  productGroups: Array<{ name: string; description: string | null; isActive: boolean }>;
  products: Array<{
    group: string;
    name: string;
    unit: string;
    criticalLevel: number;
    purchasePrice: string | null;
    salePrice: string | null;
    isActive: boolean;
  }>;
  setups: Array<{
    name: string;
    description: string | null;
    isInsideCabinet: boolean;
    isActive: boolean;
    items: Array<{ group: string; product: string; qty: number }>;
  }>;
}

export function loadLegacyDefinitions(): LegacyDefinitions {
  // Relative to this file, so the seed works from any working directory.
  const file = path.join(__dirname, "data", "legacy-definitions.json");
  return JSON.parse(readFileSync(file, "utf8")) as LegacyDefinitions;
}

/**
 * REFERENCE seed: the real hotels' floors, room types, rooms, product groups, products, setups, setup
 * contents and room-type setups, taken from the legacy live backup.
 *
 * Idempotent and non-destructive: rows are created only when their natural key is missing
 * (hotel+floor number, hotel+room type name, hotel+room number, group name, group+product name, setup
 * name). Existing rows are never updated or deactivated, QR tokens are never written, and
 * Hotel.logoUrl is only filled while it is empty. Hotels that are not present yet are skipped
 * (seedHotels runs first).
 *
 * Setup items and room-type setup assignments are what an administrator edits afterwards, so a re-run
 * must not bring back rows that were deleted on purpose: setup items are added only to setups this run
 * CREATES, and assignments only for setups this run creates or for a hotel whose room types this run
 * creates (a hotel that had none yet).
 */
export async function seedLegacyDefinitions(
  db: PrismaClient,
  data: LegacyDefinitions = loadLegacyDefinitions(),
): Promise<void> {
  // Global catalogue first: groups, products, setups, setup items.
  await db.productGroup.createMany({
    data: data.productGroups.map((g) => ({ name: g.name, description: g.description, isActive: g.isActive })),
    skipDuplicates: true,
  });
  const groups = await db.productGroup.findMany({ select: { id: true, name: true } });
  const groupId = new Map(groups.map((g) => [g.name, g.id]));

  const existingProducts = await db.product.findMany({ select: { groupId: true, name: true } });
  const haveProduct = new Set(existingProducts.map((p) => `${p.groupId}|${p.name}`));
  const missingProducts = data.products.flatMap((p) => {
    const gid = groupId.get(p.group);
    if (!gid || haveProduct.has(`${gid}|${p.name}`)) return [];
    return [
      {
        groupId: gid,
        name: p.name,
        unit: p.unit,
        criticalLevel: p.criticalLevel,
        purchasePrice: p.purchasePrice,
        salePrice: p.salePrice,
        isActive: p.isActive,
      },
    ];
  });
  if (missingProducts.length > 0) await db.product.createMany({ data: missingProducts });
  const products = await db.product.findMany({ select: { id: true, groupId: true, name: true } });
  const productId = new Map(products.map((p) => [`${p.groupId}|${p.name}`, p.id]));

  const existingSetupNames = new Set((await db.setup.findMany({ select: { name: true } })).map((s) => s.name));
  const createdSetups = new Set(data.setups.map((s) => s.name).filter((name) => !existingSetupNames.has(name)));
  await db.setup.createMany({
    data: data.setups.map((s) => ({
      name: s.name,
      description: s.description,
      isInsideCabinet: s.isInsideCabinet,
      isActive: s.isActive,
    })),
    skipDuplicates: true,
  });
  const setups = await db.setup.findMany({ select: { id: true, name: true } });
  const setupId = new Map(setups.map((s) => [s.name, s.id]));

  const setupItems = data.setups.flatMap((s) =>
    s.items.flatMap((item) => {
      if (!createdSetups.has(s.name)) return [];
      const sid = setupId.get(s.name);
      const gid = groupId.get(item.group);
      const pid = gid ? productId.get(`${gid}|${item.product}`) : undefined;
      return sid && pid ? [{ setupId: sid, productId: pid, qty: item.qty }] : [];
    }),
  );
  await db.setupItem.createMany({ data: setupItems, skipDuplicates: true });

  // Per hotel: floors, room types, rooms, room-type setups, logo.
  for (const h of data.hotels) {
    const hotel = await db.hotel.findUnique({ where: { code: h.code }, select: { id: true, logoUrl: true } });
    if (!hotel) continue;

    const hadRoomTypes = (await db.roomType.count({ where: { hotelId: hotel.id } })) > 0;
    await db.floor.createMany({
      data: h.floors.map((f) => ({ hotelId: hotel.id, number: f.number, name: f.name, isActive: f.isActive })),
      skipDuplicates: true,
    });
    await db.roomType.createMany({
      data: h.roomTypes.map((t) => ({
        hotelId: hotel.id,
        name: t.name,
        cabinetCount: t.cabinetCount,
        isActive: t.isActive,
      })),
      skipDuplicates: true,
    });
    const floors = await db.floor.findMany({ where: { hotelId: hotel.id }, select: { id: true, number: true } });
    const floorId = new Map(floors.map((f) => [f.number, f.id]));
    const types = await db.roomType.findMany({ where: { hotelId: hotel.id }, select: { id: true, name: true } });
    const typeId = new Map(types.map((t) => [t.name, t.id]));

    await db.room.createMany({
      data: h.rooms.flatMap((r) => {
        const fid = floorId.get(r.floorNumber);
        if (!fid) return [];
        return [
          {
            hotelId: hotel.id,
            floorId: fid,
            roomTypeId: r.roomType ? (typeId.get(r.roomType) ?? null) : null,
            number: r.number,
            capacity: r.capacity,
            guestMessage: r.guestMessage,
            isActive: r.isActive,
          },
        ];
      }),
      skipDuplicates: true,
    });

    await db.roomTypeSetup.createMany({
      data: h.roomTypeSetups.flatMap((a) => {
        const tid = typeId.get(a.roomType);
        const sid = setupId.get(a.setup);
        if (!tid || !sid) return [];
        if (hadRoomTypes && !createdSetups.has(a.setup)) return [];
        return [{ hotelId: hotel.id, roomTypeId: tid, setupId: sid }];
      }),
      skipDuplicates: true,
    });

    if (h.logoUrl && !hotel.logoUrl) {
      await db.hotel.update({ where: { id: hotel.id }, data: { logoUrl: h.logoUrl } });
    }
  }
}
