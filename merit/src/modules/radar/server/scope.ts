// Who may look at which hotel and which layers (spec 3.2, 6.2). The radar never writes.
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can, type Action } from "@/lib/rbac";
import type { RadarLayer } from "../types";

/** Screen whose `V` right opens each layer; SISTEM (alerts, mail) is always part of the radar. */
export const LAYER_GATES: Record<RadarLayer, { screen?: string }> = {
  MINIBAR: { screen: "MB-KAT" },
  SIPARIS: { screen: "QS-KUY" },
  ODA_SERVISI: { screen: "RO-TAL" },
  PERSONEL: { screen: "CR-ONL" },
  SISTEM: {},
};

/** Roles whose radar is limited to the MINIBAR layer. */
export const MINIBAR_ONLY_ROLES: readonly string[] = ["R-MTY"];

const ORDER: RadarLayer[] = ["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"];

/**
 * `CR-RAD` right on the hotel first (FORBIDDEN + audit otherwise), then the layers whose gate screen the
 * caller may view there. `can()` already folds in the hotel module and the role's module access.
 */
export async function assertRadarScope(ctx: Ctx, hotelId: string, action: "V" | "R"): Promise<RadarLayer[]> {
  await assertCan(ctx, "CR-RAD", action as Action, hotelId);
  const checks = await Promise.all(
    ORDER.map(async (layer) => {
      const screen = LAYER_GATES[layer].screen;
      return screen === undefined || (await can(ctx, screen, "V", hotelId)) ? layer : null;
    }),
  );
  const layers = checks.filter((l): l is RadarLayer => l !== null);
  // Minibar Yönetimi follows the minibar operation only: no system alerts, staff or order layers.
  return MINIBAR_ONLY_ROLES.includes(ctx.user.roleCode) ? layers.filter((l) => l === "MINIBAR") : layers;
}

/** Hotels the caller holds `CR-RAD V` on (cheap: no counters; the window learns its scope from this). */
export async function radarHotels(ctx: Ctx): Promise<{ id: string; code: string; name: string; canReplay: boolean }[]> {
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ code: "asc" }],
  });
  const allowed = await Promise.all(
    hotels.map(async (h) => {
      if (!(await can(ctx, "CR-RAD", "V", h.id))) return null;
      const canReplay = await can(ctx, "CR-RAD", "R", h.id);
      return { ...h, canReplay };
    }),
  );
  return allowed.filter((h): h is NonNullable<(typeof allowed)[number]> => h !== null);
}
