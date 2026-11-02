"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { testDeeplTranslation, testGeminiTranslation } from "@/modules/menu/server/translations";
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

export async function testGeminiAction(raw: unknown): Promise<
  Result<{
    ok: true;
    model: string;
    latencyMs: number;
    sample: { source: string; translated: string };
    message: string;
  }>
> {
  return safeAction(
    z.object({
      model: z.string().optional(),
      apiKey: z.string().optional(),
    }),
    async (input) => {
      await requireUser();
      return testGeminiTranslation(input.model, input.apiKey);
    },
  )(raw);
}

export async function testDeeplAction(raw: unknown): Promise<
  Result<{
    ok: true;
    latencyMs: number;
    sample: { source: string; translated: string };
    message: string;
  }>
> {
  return safeAction(
    z.object({
      apiKey: z.string().optional(),
    }).optional(),
    async (input) => {
      await requireUser();
      return testDeeplTranslation(input?.apiKey);
    },
  )(raw);
}
