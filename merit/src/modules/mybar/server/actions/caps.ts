"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { type Result, safeAction } from "@/lib/result";

export type MybarCaps = { canAct: boolean; canCancel: boolean };

/** What the session may do with MyBar requests: "Gördüm"/fulfil/close (D) and cancel (A, never R-KAT). */
export async function getMybarCapsAction(): Promise<Result<MybarCaps>> {
  return safeAction(z.undefined(), async () => {
    const ctx = await requireUser();
    const hotelId = ctx.session.hotelId;
    const [canAct, canCancel] = await Promise.all([can(ctx, "MB-PERS", "D", hotelId), can(ctx, "MB-PERS", "A", hotelId)]);
    return { canAct, canCancel };
  })(undefined);
}
