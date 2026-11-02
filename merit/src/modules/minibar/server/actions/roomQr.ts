"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction } from "@/lib/result";
import {
  listRoomQr,
  regenerateRoomQr,
  regenerateAllRoomQr,
} from "../roomQr";

const listSchema = z.object({
  hotelId: z.string().min(1),
  floorId: z.string().optional(),
});

const regenerateOneSchema = z.object({
  roomId: z.string().min(1),
});

const regenerateAllSchema = z.object({
  hotelId: z.string().min(1),
  floorId: z.string().optional(),
  onlyUnsigned: z.boolean().default(true),
});

export async function listRoomQrAction(raw: unknown) {
  return safeAction(listSchema, async (input) => {
    const ctx = await requireUser();
    return listRoomQr(ctx, input.hotelId, input.floorId);
  })(raw);
}

export async function regenerateRoomQrAction(raw: unknown) {
  return safeAction(regenerateOneSchema, async (input) => {
    const ctx = await requireUser();
    return regenerateRoomQr(ctx, input.roomId);
  })(raw);
}

export async function regenerateAllRoomQrAction(raw: unknown) {
  return safeAction(regenerateAllSchema, async (input) => {
    const ctx = await requireUser();
    return regenerateAllRoomQr(ctx, input.hotelId, input.floorId, input.onlyUnsigned);
  })(raw);
}
