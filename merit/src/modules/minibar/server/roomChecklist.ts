import { DomainError } from "@/lib/result";
import { buildChecklist } from "../checklist";
import { dayRange } from "./dates";
import type { Db } from "./minibarCommon";

/*
 * The room's check list as the floor attendant sees it: the setups assigned to the room type, an
 * in-cabinet setup repeated once per cabinet (`buildChecklist`, the same pure rule the definitions
 * preview uses). The daily replacement capacity of a product is the sum of its setup quantity over
 * ALL these copies. Nothing here reads or returns a price.
 */

export type ChecklistItem = { productId: string; name: string; groupName: string; unit: string; setupQty: number };

export type ChecklistSetup = {
  /** '{setupId}:{copy}' */
  key: string;
  setupId: string;
  name: string;
  isInsideCabinet: boolean;
  copy: number;
  copies: number;
  /** '{ad} – Dolap {copy}/{copies}' for in-cabinet setups, '{ad}' otherwise. */
  label: string;
  items: ChecklistItem[];
};

export type Checklist = {
  roomId: string;
  roomNumber: string;
  hotelId: string;
  floorId: string;
  roomTypeId: string;
  roomTypeName: string;
  cabinetCount: number;
  setups: ChecklistSetup[];
};

const NO_CHECKLIST = "Bu odanın tipi veya setup ataması yok; Kurulum Rehberi'nden tamamlayın";

/** Loads the room's check list; VALIDATION when the room has no type or no usable setup assignment. */
export async function loadRoomChecklist(db: Db, roomId: string): Promise<Checklist> {
  const room = await db.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      number: true,
      hotelId: true,
      floorId: true,
      roomTypeId: true,
      roomType: { select: { id: true, name: true, cabinetCount: true } },
    },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  if (!room.roomType) throw new DomainError("VALIDATION", NO_CHECKLIST);

  const assigned = await db.roomTypeSetup.findMany({
    where: { hotelId: room.hotelId, roomTypeId: room.roomType.id, setup: { isActive: true } },
    select: {
      setup: {
        select: {
          id: true,
          name: true,
          isInsideCabinet: true,
          items: {
            where: { product: { isActive: true } },
            select: {
              qty: true,
              product: { select: { id: true, name: true, unit: true, sortOrder: true, group: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  const setups = assigned.map((a) => a.setup).filter((s) => s.items.length > 0);
  if (setups.length === 0) throw new DomainError("VALIDATION", NO_CHECKLIST);

  const byId = new Map(setups.map((s) => [s.id, s]));
  const entries = buildChecklist(
    { cabinetCount: room.roomType.cabinetCount },
    setups.map((s) => ({ id: s.id, name: s.name, isInsideCabinet: s.isInsideCabinet })),
  );
  return {
    roomId: room.id,
    roomNumber: room.number,
    hotelId: room.hotelId,
    floorId: room.floorId,
    roomTypeId: room.roomType.id,
    roomTypeName: room.roomType.name,
    cabinetCount: room.roomType.cabinetCount,
    setups: entries.map((e) => {
      const setup = byId.get(e.setupId)!;
      const inside = e.cabinetNo !== null;
      return {
        key: `${e.setupId}:${e.copy}`,
        setupId: e.setupId,
        name: e.setupName,
        isInsideCabinet: inside,
        copy: e.copy,
        copies: e.copies,
        label: inside ? `${e.setupName} – Dolap ${e.copy}/${e.copies}` : e.setupName,
        items: setup.items
          // The order attendants are used to from the old system (products.sort_order), then by name.
          .sort((a, b) => a.product.sortOrder - b.product.sortOrder || a.product.name.localeCompare(b.product.name, "tr"))
          .map((i) => ({
            productId: i.product.id,
            name: i.product.name,
            groupName: i.product.group?.name ?? "Genel",
            unit: i.product.unit,
            setupQty: i.qty,
          })),
      };
    }),
  };
}

/** Daily replacement capacity per product: its setup quantity summed over every setup copy of the room. */
export function capacityByProduct(c: Checklist): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of c.setups) for (const i of s.items) out.set(i.productId, (out.get(i.productId) ?? 0) + i.setupQty);
  return out;
}

/** Quantity replaced per product in the room on a business day, by everybody (SETUP_KONTROL `added`). */
export async function addedToday(
  db: Db,
  roomId: string,
  day: string,
  exceptTransactionId?: string,
): Promise<Map<string, number>> {
  const rows = await db.minibarTransactionItem.findMany({
    where: {
      transaction: {
        roomId,
        type: "SETUP_KONTROL",
        occurredAt: dayRange(day),
        ...(exceptTransactionId ? { id: { not: exceptTransactionId } } : {}),
      },
    },
    select: { productId: true, added: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.productId, (out.get(r.productId) ?? 0) + r.added);
  return out;
}

