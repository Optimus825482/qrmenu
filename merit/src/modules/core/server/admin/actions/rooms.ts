"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import type { Page } from "../crud";
import * as rooms from "../rooms";

const hotelId = z.string().min(1);
const id = z.string().min(1);
// The field values are validated (with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listRoomsAction(raw: unknown): Promise<Result<Page<rooms.RoomRow>>> {
  return safeAction(z.object({ hotelId, query: rooms.roomListQuerySchema }), async (input) =>
    rooms.list(await requireUser(), input.hotelId, input.query),
  )(raw);
}

export async function createRoomAction(raw: unknown): Promise<Result<rooms.RoomRow>> {
  return safeAction(z.object({ hotelId, data }), async (input) =>
    rooms.create(await requireUser(), input.hotelId, input.data as rooms.RoomInput),
  )(raw);
}

export async function updateRoomAction(raw: unknown): Promise<Result<rooms.RoomRow>> {
  return safeAction(z.object({ hotelId, id, data }), async (input) =>
    rooms.update(await requireUser(), input.hotelId, input.id, input.data as rooms.RoomInput),
  )(raw);
}

export async function setRoomActiveAction(raw: unknown): Promise<Result<rooms.RoomRow>> {
  return safeAction(z.object({ id, isActive: z.boolean() }), async (input) =>
    rooms.setActive(await requireUser(), input.id, input.isActive),
  )(raw);
}

export async function deleteRoomAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ hotelId, id }), async (input) => {
    await rooms.remove(await requireUser(), input.hotelId, input.id);
    return null;
  })(raw);
}

export async function bulkCreateRoomsAction(raw: unknown): Promise<Result<rooms.BulkResult>> {
  return safeAction(z.object({ hotelId, data }), async (input) =>
    rooms.bulkCreate(await requireUser(), input.hotelId, input.data as rooms.BulkInput),
  )(raw);
}

export async function previewBulkRoomsAction(raw: unknown): Promise<Result<rooms.BulkPreview>> {
  return safeAction(z.object({ hotelId, data }), async (input) =>
    rooms.bulkPreview(await requireUser(), input.hotelId, input.data as rooms.BulkInput),
  )(raw);
}
