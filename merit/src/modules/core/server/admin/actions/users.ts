"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import type { Page } from "../crud";
import * as users from "../users";

const id = z.string().min(1);
// The field values are validated (with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listUsersAction(raw: unknown): Promise<Result<Page<users.UserRow>>> {
  return safeAction(users.userListQuerySchema, async (query) => users.list(await requireUser(), query))(raw);
}

export async function userOptionsAction(): Promise<Result<users.UserOptions>> {
  return safeAction(z.undefined(), async () => users.options(await requireUser()))(undefined);
}

export async function createUserAction(raw: unknown): Promise<Result<users.UserRow>> {
  return safeAction(z.object({ data }), async (input) =>
    users.create(await requireUser(), input.data as users.CreateUserInput),
  )(raw);
}

export async function updateUserAction(raw: unknown): Promise<Result<users.UserRow>> {
  return safeAction(z.object({ id, data }), async (input) =>
    users.update(await requireUser(), input.id, input.data as users.UpdateUserInput),
  )(raw);
}

export async function setUserPasswordAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ id, password: z.string().max(1000) }), async (input) => {
    await users.setPassword(await requireUser(), input.id, input.password);
    return null;
  })(raw);
}

export async function setUserActiveAction(raw: unknown): Promise<Result<users.UserRow>> {
  return safeAction(z.object({ id, isActive: z.boolean() }), async (input) =>
    users.setActive(await requireUser(), input.id, input.isActive),
  )(raw);
}
