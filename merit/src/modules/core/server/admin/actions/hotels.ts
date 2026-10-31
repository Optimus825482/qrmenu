"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { listQuerySchema, type Page } from "../crud";
import * as hotels from "../hotels";

const listSchema = z.object({
  query: listQuerySchema,
  hotelId: z.string().min(1).optional(),
});

// The field values are validated (with field-level errors) by the service itself.
const updateSchema = z.object({ id: z.string().min(1), data: z.record(z.string(), z.unknown()) });

export async function listHotelsAction(raw: unknown): Promise<Result<Page<hotels.HotelRow>>> {
  return safeAction(listSchema, async ({ query, hotelId }) =>
    hotels.list(await requireUser(), query, hotelId),
  )(raw);
}

export async function updateHotelAction(raw: unknown): Promise<Result<hotels.HotelRow>> {
  return safeAction(updateSchema, async ({ id, data }) =>
    hotels.update(await requireUser(), id, data as hotels.HotelUpdateInput),
  )(raw);
}
