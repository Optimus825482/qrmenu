import type { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/lib/i18n/locales";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { MYBAR_QTY_CAP } from "../constants";
import { localizeTexts } from "./translateService";

type Db = Prisma.TransactionClient | typeof prisma;

export type CatalogProduct = { id: string; name: string; nameLocal: string; setupQty: number; maxQty: number };
export type RoomCatalog = {
  quantityMode: "QTY" | "TICK";
  groups: { id: string; name: string; nameLocal: string; products: CatalogProduct[] }[];
};

type RawGroup = { id: string; name: string; products: { id: string; name: string; setupQty: number; maxQty: number }[] };

/** Products of the room's active setups (highest setup quantity wins), active group and product only. No prices ever. */
async function loadRoomProducts(
  db: Db,
  roomId: string,
): Promise<{ quantityMode: "QTY" | "TICK"; groups: RawGroup[] }> {
  const room = await db.room.findUnique({ where: { id: roomId }, select: { hotelId: true, roomTypeId: true } });
  const settings = await getSettings(["mybar.quantityMode", "mybar.maxQtyPerItem"], room?.hotelId);
  const quantityMode = settings["mybar.quantityMode"];
  if (!room?.roomTypeId) return { quantityMode, groups: [] };

  const assigned = await db.roomTypeSetup.findMany({
    where: { hotelId: room.hotelId, roomTypeId: room.roomTypeId, setup: { isActive: true } },
    select: {
      setup: {
        select: {
          items: {
            where: { product: { isActive: true, group: { isActive: true } } },
            select: {
              qty: true,
              product: { select: { id: true, name: true, group: { select: { id: true, name: true } } } },
            },
          },
        },
      },
    },
  });

  const best = new Map<string, { id: string; name: string; qty: number; group: { id: string; name: string } }>();
  for (const row of assigned) {
    for (const item of row.setup.items) {
      const known = best.get(item.product.id);
      if (!known || item.qty > known.qty) best.set(item.product.id, { ...item.product, qty: item.qty });
    }
  }

  const maxSetting = settings["mybar.maxQtyPerItem"];
  const groups = new Map<string, RawGroup>();
  for (const p of best.values()) {
    const base = quantityMode === "TICK" ? 1 : maxSetting === "setup" ? p.qty : maxSetting;
    const maxQty = Math.max(1, Math.min(base, MYBAR_QTY_CAP));
    const group = groups.get(p.group.id) ?? { id: p.group.id, name: p.group.name, products: [] };
    group.products.push({ id: p.id, name: p.name, setupQty: p.qty, maxQty });
    groups.set(p.group.id, group);
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "tr");
  const sorted = [...groups.values()].sort(byName);
  for (const g of sorted) g.products.sort(byName);
  return { quantityMode, groups: sorted };
}

export async function roomCatalog(roomId: string, locale: Locale): Promise<RoomCatalog> {
  const { quantityMode, groups } = await loadRoomProducts(prisma, roomId);
  const names = await localizeTexts(
    groups.flatMap((g) => [g.name, ...g.products.map((p) => p.name)]),
    locale,
  );
  const local = (text: string) => (locale === "tr" ? text : (names.get(text) ?? text));
  return {
    quantityMode,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      nameLocal: local(g.name),
      products: g.products.map((p) => ({ ...p, nameLocal: local(p.name) })),
    })),
  };
}

/** Validation view (no translation): product id -> Turkish name and per-item maximum. */
export async function catalogProductIds(
  roomId: string,
  db: Db = prisma,
): Promise<Map<string, { name: string; maxQty: number }>> {
  const { groups } = await loadRoomProducts(db, roomId);
  return new Map(groups.flatMap((g) => g.products.map((p) => [p.id, { name: p.name, maxQty: p.maxQty }] as const)));
}

export async function catalogQuantityMode(roomId: string, db: Db = prisma): Promise<"QTY" | "TICK"> {
  return (await loadRoomProducts(db, roomId)).quantityMode;
}
