import type { OutletType } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";

export type MenuAccessOutlet = {
  id: string;
  hotelId: string;
  type: OutletType;
};

/**
 * Checks whether the user has access to view/edit the menu of the given outlet.
 *
 * Rules:
 * 1. can(ctx, 'QM-MEN', action, outlet.hotelId) holds, OR
 * 2. outlet.type === 'ODA_SERVISI' AND can(ctx, 'RO-TAL', action, outlet.hotelId)
 *    AND (ctx.session.outletId === outlet.id || ctx.user.roleKind === 'SISTEM' || ctx.user.roleKind === 'YONETIM').
 *
 * If neither holds, raises assertCan(ctx, 'QM-MEN', action, outlet.hotelId) which writes YETKISIZ_DENEME audit.
 */
export async function assertMenuAccess(
  ctx: Ctx,
  outlet: MenuAccessOutlet,
  action: "V" | "D",
): Promise<void> {
  if (await can(ctx, "QM-MEN", action, outlet.hotelId)) {
    return;
  }

  if (outlet.type === "ODA_SERVISI") {
    const isBoundOutlet =
      ctx.session.outletId === outlet.id ||
      ctx.user.roleKind === "SISTEM" ||
      ctx.user.roleKind === "YONETIM";

    if (isBoundOutlet && (await can(ctx, "RO-TAL", action, outlet.hotelId))) {
      return;
    }
  }

  await assertCan(ctx, "QM-MEN", action, outlet.hotelId);
}
