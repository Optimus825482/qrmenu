"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import type { Page } from "../crud";
import * as roles from "../roles";

const id = z.string().min(1);
// The field values are validated (with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listRolesAction(raw: unknown): Promise<Result<Page<roles.RoleRow>>> {
  return safeAction(roles.roleListQuerySchema, async (query) => roles.list(await requireUser(), query))(raw);
}

export async function roleOptionsAction(): Promise<Result<roles.RoleOptions>> {
  return safeAction(z.undefined(), async () => roles.options(await requireUser()))(undefined);
}

export async function createRoleAction(raw: unknown): Promise<Result<roles.RoleRow>> {
  return safeAction(z.object({ data }), async (input) =>
    roles.create(await requireUser(), input.data as roles.CreateRoleInput),
  )(raw);
}

export async function updateRoleAction(raw: unknown): Promise<Result<roles.RoleRow>> {
  return safeAction(z.object({ id, data }), async (input) =>
    roles.update(await requireUser(), input.id, input.data as roles.UpdateRoleInput),
  )(raw);
}

export async function deleteRoleAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ id }), async (input) => {
    await roles.remove(await requireUser(), input.id);
    return null;
  })(raw);
}
