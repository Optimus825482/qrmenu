import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { parseInput, publishDefinition, withAdminTx } from "@/modules/core/server/admin/crud";
import { buildChecklist, type ChecklistEntry } from "../checklist";
import { CATALOG_SCREEN as SCREEN } from "./catalogCommon";

const ROOM_TYPE_NOT_FOUND = "Oda tipi bulunamadı";

export type RoomTypeSetupsView = {
  roomTypes: { id: string; name: string; cabinetCount: number; isActive: boolean; setupIds: string[] }[];
  setups: { id: string; name: string; isInsideCabinet: boolean; itemCount: number }[];
};

const idsSchema = z.array(z.string().min(1)).max(200, "Çok fazla setup seçildi");

/** Active room types of a hotel with their assigned setups, and the active setups to choose from. */
export async function get(ctx: Ctx, hotelId: string): Promise<RoomTypeSetupsView> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const [roomTypes, setups] = await Promise.all([
    prisma.roomType.findMany({
      where: { hotelId, isActive: true },
      select: { id: true, name: true, cabinetCount: true, isActive: true, setups: { select: { setupId: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.setup.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isInsideCabinet: true, _count: { select: { items: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
  ]);
  return {
    roomTypes: roomTypes.map(({ setups: assigned, ...rt }) => ({
      ...rt,
      setupIds: assigned.map((a) => a.setupId).sort(),
    })),
    setups: setups.map(({ _count, ...s }) => ({ ...s, itemCount: _count.items })),
  };
}

/**
 * Replaces the setups assigned to a room type with `setupIds` (empty list = remove all) in one
 * transaction. The room type row is locked, so two concurrent calls apply one after the other and
 * the result is exactly one of the lists. Only newly added setups are validated: they must exist,
 * be active and have content.
 */
export async function set(ctx: Ctx, hotelId: string, roomTypeId: string, setupIds: string[]): Promise<void> {
  const wanted = parseInput(idsSchema, setupIds);
  await apply(ctx, hotelId, roomTypeId, () => wanted);
}

/** Adds one setup to the room type's list (POST wrapper: current list plus the setup). */
export async function assignOne(ctx: Ctx, hotelId: string, roomTypeId: string, setupId: string): Promise<void> {
  await apply(ctx, hotelId, roomTypeId, (current) => [...current, setupId]);
}

/** Removes one setup from the room type's list (DELETE wrapper: current list minus the setup). */
export async function unassignOne(ctx: Ctx, hotelId: string, roomTypeId: string, setupId: string): Promise<void> {
  await apply(ctx, hotelId, roomTypeId, (current) => current.filter((id) => id !== setupId));
}

/** `next` is evaluated under the room type lock, so wrappers never lose a concurrent change. */
async function apply(
  ctx: Ctx,
  hotelId: string,
  roomTypeId: string,
  next: (current: string[]) => string[],
): Promise<void> {
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM room_types WHERE id = ${roomTypeId} AND hotel_id = ${hotelId} FOR UPDATE`,
    );
    if (locked.length === 0) throw new DomainError("NOT_FOUND", ROOM_TYPE_NOT_FOUND);

    const current = (await tx.roomTypeSetup.findMany({ where: { hotelId, roomTypeId }, select: { setupId: true } }))
      .map((a) => a.setupId)
      .sort();
    const wanted = [...new Set(next(current))].sort();
    const toAdd = wanted.filter((id) => !current.includes(id));
    const toRemove = current.filter((id) => !wanted.includes(id));
    if (toAdd.length === 0 && toRemove.length === 0) return;

    if (toAdd.length > 0) {
      // Shared lock: a setup cannot be deactivated or emptied while this assignment is being made.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM setups WHERE id IN (${Prisma.join(toAdd)}) ORDER BY id FOR SHARE`);
      const setups = await tx.setup.findMany({
        where: { id: { in: toAdd } },
        select: { id: true, name: true, isActive: true, _count: { select: { items: true } } },
      });
      const found = new Map(setups.map((s) => [s.id, s]));
      const errors: string[] = [];
      for (const id of toAdd) {
        const setup = found.get(id);
        if (!setup) errors.push("Setup bulunamadı");
        else if (!setup.isActive) errors.push(`Pasif setup atanamaz: ${setup.name}`);
        else if (setup._count.items === 0) errors.push(`İçeriği boş setup atanamaz: ${setup.name}`);
      }
      if (errors.length > 0) {
        throw new DomainError("VALIDATION", errors[0], { fieldErrors: { setupIds: errors } });
      }
    }

    if (toRemove.length > 0) {
      await tx.roomTypeSetup.deleteMany({ where: { hotelId, roomTypeId, setupId: { in: toRemove } } });
    }
    if (toAdd.length > 0) {
      await tx.roomTypeSetup.createMany({ data: toAdd.map((setupId) => ({ hotelId, roomTypeId, setupId })) });
    }
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "ROOMTYPE_SETUP_ASSIGN",
      entity: "RoomTypeSetup",
      entityId: roomTypeId,
      before: { setupIds: current },
      after: { setupIds: wanted },
    });
    await publishDefinition(tx, { hotelId, entity: "RoomTypeSetup", id: roomTypeId, op: "update" });
  });
}

/** The room check list the floor attendant will get for this room type (same rule as the room check). */
export async function preview(ctx: Ctx, hotelId: string, roomTypeId: string): Promise<ChecklistEntry[]> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const roomType = await prisma.roomType.findFirst({
    where: { id: roomTypeId, hotelId },
    select: {
      cabinetCount: true,
      setups: {
        where: { setup: { isActive: true } },
        select: { setup: { select: { id: true, name: true, isInsideCabinet: true } } },
      },
    },
  });
  if (!roomType) throw new DomainError("NOT_FOUND", ROOM_TYPE_NOT_FOUND);
  return buildChecklist(
    roomType,
    roomType.setups.map((a) => a.setup),
  );
}

/** Assignment rows of a hotel (flat list the definitions window shows). */
export async function listAssignments(ctx: Ctx, hotelId: string) {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const rows = await prisma.roomTypeSetup.findMany({
    where: { hotelId },
    select: {
      hotelId: true,
      roomTypeId: true,
      setupId: true,
      createdAt: true,
      hotel: { select: { name: true } },
      roomType: { select: { name: true } },
      setup: { select: { name: true, isInsideCabinet: true, _count: { select: { items: true } } } },
    },
    orderBy: [{ roomType: { name: "asc" } }, { setup: { name: "asc" } }],
  });
  return rows.map((a) => ({
    hotelId: a.hotelId,
    hotelName: a.hotel.name,
    roomTypeId: a.roomTypeId,
    roomTypeName: a.roomType.name,
    setupId: a.setupId,
    setupName: a.setup.name,
    isInsideCabinet: a.setup.isInsideCabinet,
    itemCount: a.setup._count.items,
    createdAt: a.createdAt.toISOString(),
  }));
}
