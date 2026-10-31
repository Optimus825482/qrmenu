"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import * as hotelModules from "../hotelModules";

const hotelId = z.string().min(1);

export async function listHotelModulesAction(
  raw: unknown,
): Promise<Result<hotelModules.HotelModuleState[]>> {
  return safeAction(z.object({ hotelId }), async (input) =>
    hotelModules.list(await requireUser(), input.hotelId),
  )(raw);
}

export async function setHotelModuleAction(
  raw: unknown,
): Promise<Result<hotelModules.HotelModuleState>> {
  return safeAction(
    z.object({ hotelId, moduleKey: z.string().min(1), enabled: z.boolean() }),
    async (input) =>
      hotelModules.set(await requireUser(), input.hotelId, input.moduleKey, input.enabled),
  )(raw);
}
