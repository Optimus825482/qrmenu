"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import * as switches from "../outletSwitches";

const id = z.string().min(1);

export async function setOutletOrderingEnabledAction(raw: unknown): Promise<Result<switches.OutletSwitches>> {
  return safeAction(z.object({ id, enabled: z.boolean() }), async (input) =>
    switches.setOrderingEnabled(await requireUser(), input.id, input.enabled),
  )(raw);
}

export async function setOutletPriceDisplayAction(raw: unknown): Promise<Result<switches.OutletSwitches>> {
  return safeAction(
    z.object({ id, value: z.enum(["INHERIT", "SHOW", "HIDE"]) }),
    async (input) => switches.setPriceDisplay(await requireUser(), input.id, input.value),
  )(raw);
}
