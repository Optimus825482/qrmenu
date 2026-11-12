"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { DomainError, type Result, safeAction } from "@/lib/result";
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

/**
 * Keys only their own panel may write (it checks its own role list first): the manual room entry switch and
 * lists are written by `saveManualEntryAction` (Denetim Masası → Minibar ve Kat → Elle oda girişi), never here.
 */
const PANEL_ONLY_KEY = /^minibar\.manualRoomEntry/;

function assertGeneralWrite(k: string): void {
  if (PANEL_ONLY_KEY.test(k)) {
    throw new DomainError("FORBIDDEN", "Bu ayar yalnızca Elle oda girişi panelinden değiştirilebilir", {
      fieldErrors: { key: ["Bu ayar yalnızca Elle oda girişi panelinden değiştirilebilir"] },
    });
  }
}

/**
 * Room-service order limits: only the system administrator may write them here. A hotel-level CR-SYS editor of
 * another role may not; the Oda Servisi Sorumlusu uses "Oda Servisi Sınırları" (order/roomService/limitsAdmin).
 */
const SYSTEM_ADMIN_ONLY_KEYS: readonly string[] = ["rs.maxOpenPerRoom", "rs.minMinutesBetweenOrders"];

function assertRoleMayWrite(ctx: Awaited<ReturnType<typeof requireUser>>, k: string): void {
  if (SYSTEM_ADMIN_ONLY_KEYS.includes(k) && ctx.user.roleKind !== "SISTEM") {
    const message = "Bu ayarı yalnızca Sistem Yöneticisi ve Oda Servisi Sorumlusu değiştirebilir";
    throw new DomainError("FORBIDDEN", message, { fieldErrors: { key: [message] } });
  }
}

export async function setSettingAction(raw: unknown): Promise<Result<settingsAdmin.SettingItem>> {
  // The value is validated against the key's own schema by the service (field error on "value").
  return safeAction(z.object({ hotelId, key, value: z.unknown() }), async (input) => {
    assertGeneralWrite(input.key);
    const ctx = await requireUser();
    assertRoleMayWrite(ctx, input.key);
    return settingsAdmin.set(ctx, input.hotelId, input.key, input.value);
  })(raw);
}

export async function clearSettingOverrideAction(
  raw: unknown,
): Promise<Result<settingsAdmin.SettingItem>> {
  return safeAction(z.object({ hotelId: z.string().min(1), key }), async (input) => {
    assertGeneralWrite(input.key);
    const ctx = await requireUser();
    assertRoleMayWrite(ctx, input.key);
    return settingsAdmin.clearHotelOverride(ctx, input.hotelId, input.key);
  })(raw);
}

/** Translation key tests spend the system's API quota: system settings (CR-SYS) "edit", system scope. */
async function requireSystemSettings(ctx: Awaited<ReturnType<typeof requireUser>>): Promise<void> {
  await assertCan(ctx, "CR-SYS", "D");
  if (ctx.user.roleKind !== "SISTEM") {
    throw new DomainError("FORBIDDEN", "Sistem geneli işlemleri yalnızca sistem yöneticisi yapabilir");
  }
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
      await requireSystemSettings(await requireUser());
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
      await requireSystemSettings(await requireUser());
      return testDeeplTranslation(input?.apiKey);
    },
  )(raw);
}
