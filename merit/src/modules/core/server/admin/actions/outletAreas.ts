"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import * as outletAreas from "../outletAreas";

const outletId = z.string().min(1);
const id = z.string().min(1);
const data = z.record(z.string(), z.unknown());

export async function listOutletAreasAction(raw: unknown): Promise<Result<outletAreas.OutletAreaRow[]>> {
  return safeAction(z.object({ outletId }), async (input) =>
    outletAreas.list(await requireUser(), input.outletId),
  )(raw);
}

export async function createOutletAreaAction(raw: unknown): Promise<Result<outletAreas.OutletAreaRow>> {
  return safeAction(z.object({ outletId, data }), async (input) =>
    outletAreas.create(await requireUser(), input.outletId, input.data as outletAreas.OutletAreaInput),
  )(raw);
}

export async function updateOutletAreaSettingsAction(raw: unknown): Promise<Result<outletAreas.OutletAreaRow>> {
  return safeAction(z.object({ outletId, id, data }), async (input) =>
    outletAreas.updateSettings(
      await requireUser(),
      input.outletId,
      input.id,
      input.data as outletAreas.OutletAreaSettingsInput,
    ),
  )(raw);
}

export async function deleteOutletAreaAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ outletId, id }), async (input) => {
    await outletAreas.remove(await requireUser(), input.outletId, input.id);
    return null;
  })(raw);
}
