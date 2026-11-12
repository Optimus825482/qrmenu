import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { getSettings } from "@/lib/settings";
import { setRoomServiceLimitSetting } from "@/modules/core/server/admin/settingsAdmin";
import { audit } from "@/modules/core/server/audit";

/*
 * "Oda Servisi Sınırları": the two per-room limits of guest room-service orders, kept as hotel settings.
 *   rs.maxOpenPerRoom           open orders a room may have at the same time
 *   rs.minMinutesBetweenOrders  minutes a room waits after an order before the next one (0 = no waiting)
 * Only the system administrator (any SISTEM role) and the roles below may read or change them here, per hotel of
 * their scope. The delegate role has no CR-SYS, so the rest of the system settings stays closed to it; the write
 * goes through the settings service (same validation, audit row and `settings.changed`).
 */

/** Non-system role codes allowed to edit the room-service limits (prisma/seed/roles.ts). */
export const ROOM_SERVICE_LIMIT_EDITOR_ROLES: readonly string[] = ["R-OSS"];

export const ROOM_SERVICE_LIMIT_KEYS = ["rs.maxOpenPerRoom", "rs.minMinutesBetweenOrders"] as const;
export type RoomServiceLimitKey = (typeof ROOM_SERVICE_LIMIT_KEYS)[number];

export type RoomServiceLimits = {
  hotelId: string;
  maxOpenPerRoom: number;
  minMinutesBetweenOrders: number;
};

const isEditorRole = (ctx: Ctx): boolean =>
  ctx.user.roleKind === "SISTEM" || ROOM_SERVICE_LIMIT_EDITOR_ROLES.includes(ctx.user.roleCode);

const isLimitKey = (key: string): key is RoomServiceLimitKey =>
  (ROOM_SERVICE_LIMIT_KEYS as readonly string[]).includes(key);

async function refuse(ctx: Ctx, hotelId: string, message: string): Promise<never> {
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      // The session hotel: `hotelId` is caller input and may not even exist.
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: "Setting",
      entityId: "rs.limits",
      after: { hotelId },
    });
  } catch (error) {
    console.error("roomServiceLimits: YETKISIZ_DENEME denetim kaydı yazılamadı", error);
  }
  throw new DomainError("FORBIDDEN", message);
}

async function assertEditor(ctx: Ctx, hotelId: string): Promise<void> {
  if (!isEditorRole(ctx)) {
    await refuse(
      ctx,
      hotelId,
      "Oda servisi sınırlarını yalnızca Sistem Yöneticisi ve Oda Servisi Sorumlusu değiştirebilir",
    );
  }
  if (!ctx.hotelIds.includes(hotelId)) await refuse(ctx, hotelId, "Bu otelin ayarına erişiminiz yok");
}

/** Active hotels of the session scope where the caller may edit the limits (empty for every other role). */
export async function limitHotels(ctx: Ctx): Promise<{ id: string; name: string }[]> {
  if (!isEditorRole(ctx)) return [];
  return prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Effective limits of the hotel (hotel row, else system row, else default). */
export async function getLimits(ctx: Ctx, hotelId: string): Promise<RoomServiceLimits> {
  await assertEditor(ctx, hotelId);
  const s = await getSettings(ROOM_SERVICE_LIMIT_KEYS, hotelId);
  return {
    hotelId,
    maxOpenPerRoom: s["rs.maxOpenPerRoom"],
    minMinutesBetweenOrders: s["rs.minMinutesBetweenOrders"],
  };
}

/** Writes one limit as the hotel's own value (never the system row) and returns the hotel's limits. */
export async function setLimit(ctx: Ctx, hotelId: string, key: string, value: unknown): Promise<RoomServiceLimits> {
  await assertEditor(ctx, hotelId);
  if (!isLimitKey(key)) {
    throw new DomainError("FORBIDDEN", "Bu ayar oda servisi sınırları penceresinden değiştirilemez", {
      fieldErrors: { key: ["Bu ayar oda servisi sınırları penceresinden değiştirilemez"] },
    });
  }
  await setRoomServiceLimitSetting(ctx, hotelId, key, value);
  return getLimits(ctx, hotelId);
}
