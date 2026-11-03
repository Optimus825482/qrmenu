import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";

export interface UserAuditCtx {
  userId?: string;
  hotelId?: string;
  ip?: string;
}

/**
 * Catalogue services (productGroups, products, setups, roomTypeSetups) live in their own files; this
 * one keeps the room types and the definitions audit list.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 3. ODA TİPİ (RoomType) CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listRoomTypes(hotelId: string) {
  const roomTypes = await prisma.roomType.findMany({
    where: { hotelId },
    include: {
      _count: {
        select: {
          rooms: true,
          setups: true,
        },
      },
      setups: {
        include: {
          setup: {
            select: { id: true, name: true, isInsideCabinet: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return roomTypes.map((rt) => ({
    id: rt.id,
    hotelId: rt.hotelId,
    name: rt.name,
    cabinetCount: rt.cabinetCount,
    isActive: rt.isActive,
    roomCount: rt._count.rooms,
    setupCount: rt._count.setups,
    assignedSetups: rt.setups.map((s) => ({
      setupId: s.setup.id,
      setupName: s.setup.name,
      isInsideCabinet: s.setup.isInsideCabinet,
      assignedAt: s.createdAt.toISOString(),
    })),
    createdAt: rt.createdAt.toISOString(),
    updatedAt: rt.updatedAt.toISOString(),
  }));
}

export async function createRoomType(
  data: { hotelId: string; name: string; cabinetCount?: number; isActive?: boolean },
  ctx: UserAuditCtx
) {
  const name = data.name.trim();
  if (!name) throw new DomainError("VALIDATION", "Oda tipi adı zorunludur.");
  if (!data.hotelId) throw new DomainError("VALIDATION", "Otel ID zorunludur.");

  const existing = await prisma.roomType.findUnique({
    where: {
      hotelId_name: { hotelId: data.hotelId, name },
    },
  });
  if (existing) throw new DomainError("CONFLICT", `Bu otelde "${name}" adında bir oda tipi zaten mevcut.`);

  const created = await prisma.$transaction(async (tx) => {
    const res = await tx.roomType.create({
      data: {
        hotelId: data.hotelId,
        name,
        cabinetCount: typeof data.cabinetCount === "number" ? data.cabinetCount : 0,
        isActive: data.isActive ?? true,
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: data.hotelId,
      action: "CREATE",
      entity: "RoomType",
      entityId: res.id,
      after: res,
      ip: ctx.ip,
    });

    return res;
  });

  return created;
}

export async function updateRoomType(
  id: string,
  data: { name?: string; cabinetCount?: number; isActive?: boolean },
  ctx: UserAuditCtx
) {
  const existing = await prisma.roomType.findUnique({ where: { id } });
  if (!existing) throw new DomainError("NOT_FOUND", "Oda tipi bulunamadı.");

  const name = data.name?.trim();
  if (name && name !== existing.name) {
    const duplicate = await prisma.roomType.findUnique({
      where: { hotelId_name: { hotelId: existing.hotelId, name } },
    });
    if (duplicate && duplicate.id !== id) {
      throw new DomainError("CONFLICT", `Bu otelde "${name}" adında başka bir oda tipi zaten var.`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.roomType.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(typeof data.cabinetCount === "number" ? { cabinetCount: data.cabinetCount } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: existing.hotelId,
      action: "UPDATE",
      entity: "RoomType",
      entityId: id,
      before: existing,
      after: res,
      ip: ctx.ip,
    });

    return res;
  });

  return updated;
}

export async function deleteRoomType(id: string, ctx: UserAuditCtx) {
  const existing = await prisma.roomType.findUnique({
    where: { id },
    include: { _count: { select: { rooms: true, setups: true } } },
  });
  if (!existing) throw new DomainError("NOT_FOUND", "Oda tipi bulunamadı.");

  if (existing._count.rooms > 0) {
    throw new DomainError("CONFLICT", 
      `Bu oda tipine bağlı ${existing._count.rooms} adet oda bulunmaktadır. Önce odaların tipini değiştiriniz.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.roomTypeSetup.deleteMany({ where: { roomTypeId: id } });
    await tx.roomType.delete({ where: { id } });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: existing.hotelId,
      action: "DELETE",
      entity: "RoomType",
      entityId: id,
      before: existing,
      ip: ctx.ip,
    });
  });

  return { success: true, message: `"${existing.name}" oda tipi başarıyla silindi.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SİLİNEMEZ AUDIT LOG İNCELEME
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Audit action names written before the catalogue services were split (CREATE, UPDATE, DELETE,
 * DEACTIVATE, ASSIGN_SETUP, UNASSIGN_SETUP) and their entity-prefixed successors mean the same thing;
 * the list recognises both names, whichever one is asked for.
 */
const ACTION_EQUIVALENTS: readonly (readonly string[])[] = [
  ["CREATE", "PRODUCT_GROUP_CREATE", "PRODUCT_CREATE", "SETUP_CREATE", "SETUP_ITEM_ADD"],
  ["UPDATE", "PRODUCT_GROUP_UPDATE", "PRODUCT_UPDATE", "SETUP_UPDATE", "SETUP_ITEM_UPDATE"],
  ["DELETE", "PRODUCT_GROUP_DELETE", "PRODUCT_DELETE", "SETUP_DELETE", "SETUP_ITEM_REMOVE"],
  ["DEACTIVATE", "PRODUCT_GROUP_SET_ACTIVE", "PRODUCT_SET_ACTIVE", "SETUP_SET_ACTIVE"],
  ["ASSIGN_SETUP", "UNASSIGN_SETUP", "ROOMTYPE_SETUP_ASSIGN"],
];

export function auditActionVariants(action: string): string[] {
  const group = ACTION_EQUIVALENTS.find((names) => names.includes(action));
  return group ? [...group] : [action];
}

export async function listSystemAuditLogs(params?: {
  entity?: string;
  action?: string;
  /** Only rows of these hotels (callers pass the hotels the user may see). */
  hotelIds?: string[];
  /** Also rows without a hotel (system-level events): system administrators only. */
  includeSystemRows?: boolean;
  limit?: number;
}) {
  const limit = Math.min(params?.limit || 100, 500);
  const where: Record<string, unknown> = {};

  if (params?.entity) where.entity = params.entity;
  if (params?.action) where.action = { in: auditActionVariants(params.action) };
  const hotelIds = params?.hotelIds ?? [];
  where.OR = [
    { hotelId: { in: hotelIds } },
    ...(params?.includeSystemRows ? [{ hotelId: null }] : []),
  ];

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: { select: { fullName: true, username: true } },
      hotel: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
    userName: l.user?.fullName || l.user?.username || "Sistem / Otomasyon",
    hotelName: l.hotel?.name || "-",
    before: l.before,
    after: l.after,
    ip: l.ip,
    createdAt: l.createdAt.toISOString(),
  }));
}
