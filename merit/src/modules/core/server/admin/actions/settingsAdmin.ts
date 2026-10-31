"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import * as settingsAdmin from "../settingsAdmin";

const hotelId = z.string().min(1).nullable();
const key = z.string().min(1);

export async function settingsScopesAction(): Promise<Result<settingsAdmin.SettingsScopes>> {
  return safeAction(z.undefined(), async () => settingsAdmin.scopes(await requireUser()))(undefined);
}

export async function listSettingsAction(
  raw: unknown,
): Promise<Result<settingsAdmin.SettingGroupRow[]>> {
  return safeAction(z.object({ hotelId }), async (input) =>
    settingsAdmin.listGrouped(await requireUser(), input.hotelId),
  )(raw);
}

export async function setSettingAction(raw: unknown): Promise<Result<settingsAdmin.SettingItem>> {
  // The value is validated against the key's own schema by the service (field error on "value").
  return safeAction(z.object({ hotelId, key, value: z.unknown() }), async (input) =>
    settingsAdmin.set(await requireUser(), input.hotelId, input.key, input.value),
  )(raw);
}

export async function clearSettingOverrideAction(
  raw: unknown,
): Promise<Result<settingsAdmin.SettingItem>> {
  return safeAction(z.object({ hotelId: z.string().min(1), key }), async (input) =>
    settingsAdmin.clearHotelOverride(await requireUser(), input.hotelId, input.key),
  )(raw);
}
