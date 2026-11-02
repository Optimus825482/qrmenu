"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction } from "@/lib/result";
import { listQuerySchema } from "@/modules/core/server/admin/listQuery";
import {
  generateRoomQr,
  generateRoomQrBulk,
  listRoomQr,
  roomQrPrintSheet,
  setRoomGuestMessage,
} from "../roomQr";

const hotelId = z.string().min(1);
const roomId = z.string().min(1);

const listSchema = listQuerySchema.extend({
  hotelId,
  floorId: z.string().min(1).optional(),
  qr: z.enum(["ALL", "MISSING", "LEGACY", "SIGNED"]).optional(),
});

export async function listRoomQrAction(raw: unknown) {
  return safeAction(listSchema, async ({ hotelId: hid, ...query }) =>
    listRoomQr(await requireUser(), hid, query),
  )(raw);
}

export async function generateRoomQrAction(raw: unknown) {
  return safeAction(
    z.object({ hotelId, roomId, regenerate: z.boolean().optional() }).strict(),
    async (input) =>
      generateRoomQr(await requireUser(), input.hotelId, input.roomId, { regenerate: input.regenerate }),
  )(raw);
}

export async function generateRoomQrBulkAction(raw: unknown) {
  return safeAction(
    z
      .object({
        hotelId,
        mode: z.enum(["MISSING", "LEGACY", "ALL"]),
        floorId: z.string().min(1).optional(),
        confirmInvalidate: z.boolean().optional(),
      })
      .strict(),
    async ({ hotelId: hid, ...input }) => generateRoomQrBulk(await requireUser(), hid, input),
  )(raw);
}

export async function setRoomGuestMessageAction(raw: unknown) {
  return safeAction(
    z
      .object({ hotelId, roomIds: z.array(roomId).min(1).max(500), message: z.string().nullable() })
      .strict(),
    async ({ hotelId: hid, ...input }) => setRoomGuestMessage(await requireUser(), hid, input),
  )(raw);
}

export async function roomQrPrintSheetAction(raw: unknown) {
  return safeAction(
    z
      .object({ hotelId, roomIds: z.array(roomId).max(500).optional(), floorId: z.string().min(1).optional() })
      .strict(),
    async ({ hotelId: hid, ...opts }) => roomQrPrintSheet(await requireUser(), hid, opts),
  )(raw);
}
