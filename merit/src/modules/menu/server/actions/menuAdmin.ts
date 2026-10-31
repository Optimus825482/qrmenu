"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { type MenuContext, menuContext } from "../menuContext";

/** Menu outlets of a hotel for the Menü Yönetimi window and what the user may do there. */
export async function menuContextAction(raw: unknown): Promise<Result<MenuContext>> {
  return safeAction(z.object({ hotelId: z.string().min(1) }), async ({ hotelId }) =>
    menuContext(await requireUser(), hotelId),
  )(raw);
}
