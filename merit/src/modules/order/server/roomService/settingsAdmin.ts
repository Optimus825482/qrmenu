import { z } from "zod";
import { PriceDisplay } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError, fromZod } from "@/lib/result";
import { CURRENCY_CODE, CURRENCY_REQUIRED, type OutletRow, updateRoomServiceOutlet } from "@/modules/core/server/admin/outlets";
import { audit } from "@/modules/core/server/audit";
import { ROOM_SERVICE_LIMIT_EDITOR_ROLES } from "./limitsAdmin";

/*
 * "Oda Servisi Ayarları": the operational switches of the hotel's single ODA_SERVISI outlet, edited outside the
 * outlet screens (room service is not listed there). Only the settings room service really reads are offered:
 *   orderingEnabled   guests may send room-service orders (guestState.orderingOpen)
 *   autoPrintReceipt  an approved room order queues its receipt (printJobs.enqueueReceipt)
 *   priceDisplay      prices on the guest's room-service menu (guestState.pricesShown)
 *   currency          currency of those prices and of the order snapshot (guestState.currency)
 * Left out on purpose: kdsEnabled and autoPrintKitchen (the kitchen screen and the kitchen ticket only handle
 * table orders), name / type / hasMenu / hasOrdering / isActive and the table settings.
 * The caller never names an outlet: it is found from the hotel. Who may edit is the rule of "Oda Servisi
 * Sınırları" (limitsAdmin): the system administrator and the delegate roles, per hotel of their scope. The write
 * goes through the outlet service (same audit row and live events as an outlet update).
 */

/** Non-system role codes allowed to edit the room-service settings: the editors of the room-service limits. */
export const ROOM_SERVICE_SETTINGS_EDITOR_ROLES: readonly string[] = [...ROOM_SERVICE_LIMIT_EDITOR_ROLES, "R-FBM"];

const NO_OUTLET = "Bu otelde oda servisi tanımlı değil";

export type RoomServiceSettings = {
  hotelId: string;
  orderingEnabled: boolean;
  autoPrintReceipt: boolean;
  priceDisplay: PriceDisplay;
  currency: string;
  /**
   * False while the outlet is passive or has its menu / ordering module off: guests cannot order whatever
   * `orderingEnabled` says, and this window cannot change that.
   */
  canTakeOrders: boolean;
};

/** Every field is required and nothing else is accepted: an unknown key (name, isActive, an outlet id) is refused. */
export const roomServiceSettingsSchema = z.strictObject({
  orderingEnabled: z.boolean("Sipariş alımını seçin"),
  autoPrintReceipt: z.boolean("Fiş yazdırmayı seçin"),
  priceDisplay: z.enum(PriceDisplay, "Fiyat gösterimini seçin"),
  currency: z
    .string(CURRENCY_REQUIRED)
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => CURRENCY_CODE.test(v), CURRENCY_REQUIRED),
});
export type RoomServiceSettingsInput = z.input<typeof roomServiceSettingsSchema>;

const isEditorRole = (ctx: Ctx): boolean =>
  ctx.user.roleKind === "SISTEM" || ROOM_SERVICE_SETTINGS_EDITOR_ROLES.includes(ctx.user.roleCode);

async function refuse(ctx: Ctx, hotelId: string, message: string): Promise<never> {
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      // The session hotel: `hotelId` is caller input and may not even exist.
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: "Outlet",
      entityId: "rs.settings",
      after: { hotelId },
    });
  } catch (error) {
    console.error("roomServiceSettings: YETKISIZ_DENEME denetim kaydı yazılamadı", error);
  }
  throw new DomainError("FORBIDDEN", message);
}

async function assertEditor(ctx: Ctx, hotelId: string): Promise<void> {
  if (!isEditorRole(ctx)) {
    await refuse(
      ctx,
      hotelId,
      "Oda servisi ayarlarını yalnızca Sistem Yöneticisi ve Oda Servisi Sorumlusu değiştirebilir",
    );
  }
  if (!ctx.hotelIds.includes(hotelId)) await refuse(ctx, hotelId, "Bu otelin ayarına erişiminiz yok");
}

type SettingsSource = Pick<
  OutletRow,
  "orderingEnabled" | "autoPrintReceipt" | "priceDisplay" | "currency" | "isActive" | "hasMenu" | "hasOrdering"
>;

const toSettings = (hotelId: string, o: SettingsSource): RoomServiceSettings => ({
  hotelId,
  orderingEnabled: o.orderingEnabled,
  autoPrintReceipt: o.autoPrintReceipt,
  priceDisplay: o.priceDisplay,
  currency: o.currency,
  canTakeOrders: o.isActive && o.hasMenu && o.hasOrdering,
});

/** Active hotels of the session scope where the caller may edit the settings (empty for every other role). */
export async function settingsHotels(ctx: Ctx): Promise<{ id: string; name: string }[]> {
  if (!isEditorRole(ctx)) return [];
  return prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function findOutlet(hotelId: string): Promise<SettingsSource> {
  const outlet = await prisma.outlet.findFirst({
    where: { hotelId, type: "ODA_SERVISI" },
    select: {
      orderingEnabled: true,
      autoPrintReceipt: true,
      priceDisplay: true,
      currency: true,
      isActive: true,
      hasMenu: true,
      hasOrdering: true,
    },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", NO_OUTLET);
  return outlet;
}

/** The settings of the hotel's room-service outlet; NOT_FOUND when the hotel has none. */
export async function get(ctx: Ctx, hotelId: string): Promise<RoomServiceSettings> {
  await assertEditor(ctx, hotelId);
  return toSettings(hotelId, await findOutlet(hotelId));
}

/** Replaces the four settings of the hotel's room-service outlet and returns them as stored. */
export async function update(ctx: Ctx, hotelId: string, raw: unknown): Promise<RoomServiceSettings> {
  await assertEditor(ctx, hotelId);
  const parsed = roomServiceSettingsSchema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  await findOutlet(hotelId);
  return toSettings(hotelId, await updateRoomServiceOutlet(ctx, hotelId, parsed.data));
}
