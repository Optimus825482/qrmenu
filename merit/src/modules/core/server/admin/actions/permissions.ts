"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import * as permissions from "../permissions";

const id = z.string().min(1);
const hotelId = z.string().min(1).nullable();

export async function permissionMatrixAction(raw: unknown): Promise<Result<permissions.PermissionMatrix>> {
  return safeAction(z.object({ roleId: id, hotelId: hotelId.optional() }), async (input) =>
    permissions.matrix(await requireUser(), input.roleId, input.hotelId),
  )(raw);
}

export async function setPermissionModuleAction(raw: unknown): Promise<Result<permissions.ModuleCell>> {
  return safeAction(
    z.object({ roleId: id, hotelId, moduleKey: z.string().min(1), enabled: z.boolean() }),
    async (input) =>
      permissions.setModule(await requireUser(), input.roleId, input.hotelId, input.moduleKey, input.enabled),
  )(raw);
}

export async function setPermissionScreenAction(raw: unknown): Promise<Result<permissions.ScreenCell>> {
  return safeAction(
    z.object({
      roleId: id,
      hotelId,
      screenCode: z.string().min(1),
      flags: z.record(z.string(), z.unknown()),
    }),
    async (input) =>
      permissions.setScreen(await requireUser(), input.roleId, input.hotelId, input.screenCode, input.flags as permissions.Flags),
  )(raw);
}

export async function resetHotelOverridesAction(raw: unknown): Promise<Result<{ screens: number; modules: number }>> {
  return safeAction(z.object({ roleId: id, hotelId: id }), async (input) =>
    permissions.resetHotelOverrides(await requireUser(), input.roleId, input.hotelId),
  )(raw);
}

export async function copyPermissionsAction(
  raw: unknown,
): Promise<Result<{ screens: number; modules: number }>> {
  return safeAction(z.object({ roleId: id, sourceRoleId: id, hotelId }), async (input) =>
    permissions.copyFromRole(await requireUser(), input.roleId, input.sourceRoleId, input.hotelId),
  )(raw);
}
