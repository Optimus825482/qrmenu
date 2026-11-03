import type { Ctx } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { MYBAR_ACK_ROLE_CODES } from "../constants";

/**
 * Who must acknowledge a guest MyBar request: only floor attendants (R-KAT) sessions whose hotel has the
 * minibar module on and who may act on MB-PERS ("Gördüm" is a `D` action). Depot and management sessions
 * see the request list but are never blocked by the dialog.
 */
export async function shouldShowAckHost(ctx: Ctx): Promise<boolean> {
  if (!(MYBAR_ACK_ROLE_CODES as readonly string[]).includes(ctx.user.roleCode)) return false;
  return can(ctx, "MB-PERS", "D", ctx.session.hotelId);
}
