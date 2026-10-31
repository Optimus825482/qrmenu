"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import type { Page } from "../crud";
import * as outlets from "../outlets";

const hotelId = z.string().min(1);
const id = z.string().min(1);
// The field values are validated (with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listOutletsAction(raw: unknown): Promise<Result<Page<outlets.OutletRow>>> {
  return safeAction(z.object({ hotelId, query: outlets.outletListQuerySchema }), async (input) =>
    outlets.list(await requireUser(), input.hotelId, input.query),
  )(raw);
}

export async function createOutletAction(raw: unknown): Promise<Result<outlets.OutletRow>> {
  return safeAction(z.object({ hotelId, data }), async (input) =>
    outlets.create(await requireUser(), input.hotelId, input.data as outlets.OutletInput),
  )(raw);
}

export async function updateOutletAction(raw: unknown): Promise<Result<outlets.OutletRow>> {
  return safeAction(z.object({ hotelId, id, data }), async (input) =>
    outlets.update(await requireUser(), input.hotelId, input.id, input.data as outlets.OutletInput),
  )(raw);
}

export async function setOutletActiveAction(raw: unknown): Promise<Result<outlets.OutletRow>> {
  return safeAction(z.object({ id, isActive: z.boolean() }), async (input) =>
    outlets.setActive(await requireUser(), input.id, input.isActive),
  )(raw);
}

export async function setOutletOrderingAction(raw: unknown): Promise<Result<outlets.OutletRow>> {
  return safeAction(z.object({ id, enabled: z.boolean() }), async (input) =>
    outlets.setOrderingEnabled(await requireUser(), input.id, input.enabled),
  )(raw);
}

export async function deleteOutletAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ hotelId, id }), async (input) => {
    await outlets.remove(await requireUser(), input.hotelId, input.id);
    return null;
  })(raw);
}
