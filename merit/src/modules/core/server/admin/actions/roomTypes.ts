"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { listQuerySchema, type Page } from "../crud";
import * as roomTypes from "../roomTypes";

const hotelId = z.string().min(1);
const id = z.string().min(1);
// The field values are validated (with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listRoomTypesAction(raw: unknown): Promise<Result<Page<roomTypes.RoomTypeRow>>> {
  return safeAction(z.object({ hotelId, query: listQuerySchema }), async (input) =>
    roomTypes.list(await requireUser(), input.hotelId, input.query),
  )(raw);
}

export async function createRoomTypeAction(raw: unknown): Promise<Result<roomTypes.RoomTypeRow>> {
  return safeAction(z.object({ hotelId, data }), async (input) =>
    roomTypes.create(await requireUser(), input.hotelId, input.data as roomTypes.RoomTypeInput),
  )(raw);
}

export async function updateRoomTypeAction(raw: unknown): Promise<Result<roomTypes.RoomTypeRow>> {
  return safeAction(z.object({ hotelId, id, data }), async (input) =>
    roomTypes.update(
      await requireUser(),
      input.hotelId,
      input.id,
      input.data as roomTypes.RoomTypeInput,
    ),
  )(raw);
}

export async function deleteRoomTypeAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ hotelId, id }), async (input) => {
    await roomTypes.remove(await requireUser(), input.hotelId, input.id);
    return null;
  })(raw);
}

export async function copyRoomTypesAction(
  raw: unknown,
): Promise<Result<roomTypes.CopyResult>> {
  return safeAction(z.object({ toHotelId: hotelId, fromHotelId: hotelId }), async (input) =>
    roomTypes.copyFromHotel(await requireUser(), input.toHotelId, input.fromHotelId),
  )(raw);
}
