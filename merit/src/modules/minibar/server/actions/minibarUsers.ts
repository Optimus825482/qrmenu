"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import type { Page } from "@/modules/core/server/admin/listQuery";
import type { UserRow } from "@/modules/core/server/admin/users";
import {
  createMinibarWaiter,
  type CreateMinibarWaiterInput,
  listMinibarUsers,
  mailMinibarUserCredentials,
  type MinibarUserCredentials,
  minibarUserOptions,
  resetMinibarUserPassword,
  setMinibarUserActive,
  updateMinibarUser,
  type UpdateMinibarUserInput,
} from "../minibarUsers";

const id = z.string().min(1);
// Field values are validated (strictly, with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listMinibarUsersAction(raw: unknown): Promise<Result<Page<UserRow>>> {
  return safeAction(z.record(z.string(), z.unknown()), async (query) =>
    listMinibarUsers(await requireUser(), query),
  )(raw);
}

export async function minibarUserOptionsAction(): Promise<
  Result<{ hotels: { id: string; code: string; name: string }[] }>
> {
  return safeAction(z.undefined(), async () => minibarUserOptions(await requireUser()))(undefined);
}

export async function createMinibarWaiterAction(raw: unknown): Promise<Result<MinibarUserCredentials>> {
  return safeAction(z.object({ data }), async (input) => createMinibarWaiter(await requireUser(), input.data as CreateMinibarWaiterInput))(raw);
}

export async function updateMinibarUserAction(raw: unknown): Promise<Result<UserRow>> {
  return safeAction(z.object({ id, data }), async (input) =>
    updateMinibarUser(await requireUser(), input.id, input.data as UpdateMinibarUserInput),
  )(raw);
}

export async function resetMinibarUserPasswordAction(raw: unknown): Promise<Result<{ temporaryPassword: string }>> {
  return safeAction(z.object({ id }), async (input) => resetMinibarUserPassword(await requireUser(), input.id))(raw);
}

export async function mailMinibarUserCredentialsAction(
  raw: unknown,
): Promise<Result<{ to: string; newTemporaryPassword: boolean }>> {
  return safeAction(z.object({ id }), async (input) => mailMinibarUserCredentials(await requireUser(), input.id))(raw);
}

export async function setMinibarUserActiveAction(raw: unknown): Promise<Result<UserRow>> {
  return safeAction(z.object({ id, isActive: z.boolean() }), async (input) =>
    setMinibarUserActive(await requireUser(), input.id, input.isActive),
  )(raw);
}
