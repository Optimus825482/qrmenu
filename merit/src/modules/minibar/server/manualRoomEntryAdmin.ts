import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { getSettings } from "@/lib/settings";
import { setManualRoomEntrySetting } from "@/modules/core/server/admin/settingsAdmin";
import { audit } from "@/modules/core/server/audit";

/*
 * Denetim Masası → Minibar ve Kat → "Elle oda girişi": the hotel-wide switch, the floors and the rooms where a
 * typed room number may replace the QR scan while `minibar.requireQrForControl` is on. Stored as three hotel
 * settings (boolean + id lists, JSON values) through the settings service, so the validation, the audit row and
 * `settings.changed` apply as for every setting. Only the roles below may open or change it.
 */

/** Role codes allowed to edit manual room entry (prisma/seed/roles.ts). */
export const MANUAL_ENTRY_EDITOR_ROLES: readonly string[] = ["R-SYS", "R-MTY"];

/**
 * Editors that are not system administrators (Minibar Takip Yöneticisi): no CR-SYS at all, so the rest of the
 * system settings stays closed to them. In a hotel of their scope they need minibar room-check view there
 * (MB-TUK V: the MINIBAR module is on and the matrix still opens minibar to the role).
 */
const DELEGATE_GATE = { screen: "MB-TUK", action: "V" } as const;

async function editorIn(ctx: Ctx, hotelId: string): Promise<boolean> {
  if (!MANUAL_ENTRY_EDITOR_ROLES.includes(ctx.user.roleCode)) return false;
  if (ctx.user.roleKind === "SISTEM") return can(ctx, "CR-SYS", "D", hotelId);
  return ctx.hotelIds.includes(hotelId) && can(ctx, DELEGATE_GATE.screen, DELEGATE_GATE.action, hotelId);
}

/** Active hotels of the session scope where the caller may edit manual room entry (the panel's hotel list). */
export async function manualEntryHotels(ctx: Ctx): Promise<{ id: string; name: string }[]> {
  if (!MANUAL_ENTRY_EDITOR_ROLES.includes(ctx.user.roleCode)) return [];
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const allowed = [];
  for (const hotel of hotels) if (await editorIn(ctx, hotel.id)) allowed.push(hotel);
  return allowed;
}

export type ManualEntryConfig = {
  hotelId: string;
  requireQr: boolean;
  enabled: boolean;
  floorIds: string[];
  roomIds: string[];
  floors: { id: string; number: number; name: string; rooms: { id: string; number: string }[] }[];
};

async function assertEditor(ctx: Ctx, hotelId: string): Promise<void> {
  if (!MANUAL_ENTRY_EDITOR_ROLES.includes(ctx.user.roleCode)) {
    try {
      await audit(prisma, {
        userId: ctx.user.id,
        hotelId,
        action: "YETKISIZ_DENEME",
        entity: "Setting",
        entityId: "minibar.manualRoomEntry",
      });
    } catch (error) {
      console.error("manualRoomEntry: YETKISIZ_DENEME denetim kaydı yazılamadı", error);
    }
    throw new DomainError(
      "FORBIDDEN",
      "Elle oda girişi ayarını yalnızca Sistem Yöneticisi ve Minibar Takip Yöneticisi değiştirebilir",
    );
  }
  if (ctx.user.roleKind === "SISTEM") {
    await assertCan(ctx, "CR-SYS", "D", hotelId);
    return;
  }
  if (!ctx.hotelIds.includes(hotelId)) throw new DomainError("FORBIDDEN", "Bu otelin ayarına erişiminiz yok");
  await assertCan(ctx, DELEGATE_GATE.screen, DELEGATE_GATE.action, hotelId);
}

export async function loadManualEntryConfig(ctx: Ctx, hotelId: string): Promise<ManualEntryConfig> {
  await assertEditor(ctx, hotelId);
  const [s, floors] = await Promise.all([
    getSettings(
      [
        "minibar.requireQrForControl",
        "minibar.manualRoomEntry",
        "minibar.manualRoomEntryFloorIds",
        "minibar.manualRoomEntryRoomIds",
      ],
      hotelId,
    ),
    prisma.floor.findMany({
      where: { hotelId },
      select: {
        id: true,
        number: true,
        name: true,
        rooms: { where: { isActive: true }, select: { id: true, number: true }, orderBy: { number: "asc" } },
      },
      orderBy: { number: "asc" },
    }),
  ]);
  const natural = (a: string, b: string) => a.localeCompare(b, "tr", { numeric: true });
  return {
    hotelId,
    requireQr: s["minibar.requireQrForControl"],
    enabled: s["minibar.manualRoomEntry"],
    floorIds: s["minibar.manualRoomEntryFloorIds"],
    roomIds: s["minibar.manualRoomEntryRoomIds"],
    floors: floors.map((f) => ({ ...f, rooms: [...f.rooms].sort((a, b) => natural(a.number, b.number)) })),
  };
}

const saveSchema = z.strictObject({
  enabled: z.boolean(),
  floorIds: z.array(z.string().min(1).max(64)).max(500),
  roomIds: z.array(z.string().min(1).max(64)).max(5000),
});

/** Saves the three hotel settings; floor and room ids must belong to the hotel. */
export async function saveManualEntryConfig(ctx: Ctx, hotelId: string, input: unknown): Promise<ManualEntryConfig> {
  await assertEditor(ctx, hotelId);
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const floorIds = [...new Set(parsed.data.floorIds)];
  const roomIds = [...new Set(parsed.data.roomIds)];
  const [floors, rooms] = await Promise.all([
    prisma.floor.count({ where: { hotelId, id: { in: floorIds } } }),
    prisma.room.count({ where: { hotelId, id: { in: roomIds } } }),
  ]);
  if (floors !== floorIds.length || rooms !== roomIds.length) {
    throw new DomainError("VALIDATION", "Seçilen kat veya oda bu otele ait değil");
  }
  await setManualRoomEntrySetting(ctx, hotelId, "minibar.manualRoomEntry", parsed.data.enabled);
  await setManualRoomEntrySetting(ctx, hotelId, "minibar.manualRoomEntryFloorIds", floorIds);
  await setManualRoomEntrySetting(ctx, hotelId, "minibar.manualRoomEntryRoomIds", roomIds);
  return loadManualEntryConfig(ctx, hotelId);
}
