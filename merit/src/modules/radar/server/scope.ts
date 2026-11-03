// Who may look at which hotel and which layers (spec 3.2, 6.2). The radar never writes.
import type { Ctx } from "@/lib/auth";
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
  return checks.filter((l): l is RadarLayer => l !== null);
}
