import { z } from "zod";
import type { ModuleKey } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan } from "@/lib/rbac";
import { publish } from "@/lib/realtime";
import { audit } from "@/modules/core/server/audit";
import { parseInput, publishDefinition, withAdminTx } from "./crud";

const SCREEN = "CR-TAN";

/** The modules a hotel can switch (CORE is always on). A module without a row counts as off. */
export const SWITCHABLE_MODULES = ["MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"] as const satisfies readonly ModuleKey[];
export type SwitchableModule = (typeof SWITCHABLE_MODULES)[number];

export type HotelModuleState = { moduleKey: SwitchableModule; enabled: boolean };

export const hotelModuleSchema = z.object({
  moduleKey: z.enum(SWITCHABLE_MODULES, "Geçersiz modül; çekirdek modül kapatılamaz"),
  enabled: z.boolean("Durum gerekli"),
});

/** The four switchable modules of the hotel with their state, in a fixed order. */
export async function list(ctx: Ctx, hotelId: string): Promise<HotelModuleState[]> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const rows = await prisma.hotelModule.findMany({ where: { hotelId } });
  const enabled = new Map(rows.map((r) => [r.moduleKey, r.enabled]));
  return SWITCHABLE_MODULES.map((moduleKey) => ({ moduleKey, enabled: enabled.get(moduleKey) === true }));
}

/** Switches a module of one hotel on or off; role access and login targets follow at the next request. */
export async function set(
  ctx: Ctx,
  hotelId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<HotelModuleState> {
  const input = parseInput(hotelModuleSchema, { moduleKey, enabled });
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    const hotel = await tx.hotel.findUnique({ where: { id: hotelId }, select: { id: true } });
    if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
    const existing = await tx.hotelModule.findUnique({
      where: { hotelId_moduleKey: { hotelId, moduleKey: input.moduleKey } },
    });
    const row = await tx.hotelModule.upsert({
      where: { hotelId_moduleKey: { hotelId, moduleKey: input.moduleKey } },
      create: { hotelId, moduleKey: input.moduleKey, enabled: input.enabled },
      update: { enabled: input.enabled },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "HOTEL_MODULE_SET",
      entity: "HotelModule",
      entityId: row.id,
      before: { moduleKey: input.moduleKey, enabled: existing?.enabled === true },
      after: { moduleKey: input.moduleKey, enabled: row.enabled },
    });
    await publishDefinition(tx, { hotelId, entity: "hotelModule", id: row.id, op: "update" });
    await publish(
      { type: "settings.changed", hotelId, payload: { key: `module.${input.moduleKey}` } },
      tx,
    );
    return { moduleKey: input.moduleKey, enabled: row.enabled };
  });
}
