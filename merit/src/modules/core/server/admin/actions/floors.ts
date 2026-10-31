"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { listQuerySchema, type Page } from "../crud";
import * as floors from "../floors";

const hotelId = z.string().min(1);
const id = z.string().min(1);
// The field values are validated (with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listFloorsAction(raw: unknown): Promise<Result<Page<floors.FloorRow>>> {
  return safeAction(z.object({ hotelId, query: listQuerySchema }), async (input) =>
    floors.list(await requireUser(), input.hotelId, input.query),
  )(raw);
}

export async function createFloorAction(raw: unknown): Promise<Result<floors.FloorRow>> {
  return safeAction(z.object({ hotelId, data }), async (input) =>
    floors.create(await requireUser(), input.hotelId, input.data as floors.FloorInput),
  )(raw);
}

export async function updateFloorAction(raw: unknown): Promise<Result<floors.FloorRow>> {
  return safeAction(z.object({ hotelId, id, data }), async (input) =>
    floors.update(await requireUser(), input.hotelId, input.id, input.data as floors.FloorInput),
  )(raw);
}

export async function deleteFloorAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ hotelId, id }), async (input) => {
    await floors.remove(await requireUser(), input.hotelId, input.id);
    return null;
  })(raw);
}
