"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import type { Page } from "@/modules/core/server/admin/listQuery";
import {
  acknowledge,
  cancel,
  complete,
  get,
  kpis,
  list,
  listUnseen,
  type MybarListInput,
  mybarListSchema,
  type MybarRow,
} from "../requests";

const idSchema = z.string().min(1).max(64);
const hotelIdOptSchema = z.string().min(1).max(64).optional();

export async function listMybarAction(input: MybarListInput = {}): Promise<Result<Page<MybarRow>>> {
  return safeAction(mybarListSchema, async (valid) => list(await requireUser(), valid))(input);
}

export async function mybarKpisAction(
  hotelId?: string,
): Promise<Result<{ pending: number; unseen: number; completedToday: number; cancelledToday: number }>> {
  return safeAction(hotelIdOptSchema, async (hid) => kpis(await requireUser(), hid))(hotelId);
}

export async function getMybarAction(id: string): Promise<Result<MybarRow>> {
  return safeAction(idSchema, async (validId) => get(await requireUser(), validId))(id);
}

export async function listUnseenMybarAction(): Promise<Result<MybarRow[]>> {
  return safeAction(z.undefined(), async () => listUnseen(await requireUser()))(undefined);
}

export async function acknowledgeMybarAction(
  id: string,
): Promise<Result<{ firstSeen: boolean; seenAt: Date }>> {
  return safeAction(idSchema, async (validId) => acknowledge(await requireUser(), validId))(id);
}

const completeActionSchema = z.object({
  id: idSchema,
  input: z.object({
    confirmMissing: z.boolean().optional(),
    closeNote: z.string().optional(),
  }),
});

export async function completeMybarAction(
  id: string,
  input: { confirmMissing?: boolean; closeNote?: string } = {},
): Promise<Result<{ closedWithMissing: boolean }>> {
  return safeAction(completeActionSchema, async ({ id: validId, input: validInput }) =>
    complete(await requireUser(), validId, validInput),
  )({ id, input });
}

const cancelActionSchema = z.object({
  id: idSchema,
  input: z.object({
    reason: z.string(),
  }),
});

export async function cancelMybarAction(
  id: string,
  input: { reason: string },
): Promise<Result<void>> {
  return safeAction(cancelActionSchema, async ({ id: validId, input: validInput }) =>
    cancel(await requireUser(), validId, validInput),
  )({ id, input });
}
