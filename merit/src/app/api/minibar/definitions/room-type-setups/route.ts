import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { auditCtxOf, handle, parseBody, parseQuery, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import {
  assignRoomTypeSetup,
  listRoomTypeSetups,
  removeRoomTypeSetup,
} from "@/modules/minibar/server/minibarDefinitionsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const keySchema = z.object({
  hotelId: z.string().min(1).max(64),
  roomTypeId: z.string().min(1).max(64),
  setupId: z.string().min(1).max(64),
});

/** The room type decides its hotel; a mismatching body hotelId is treated as not found. */
async function resolveHotel(roomTypeId: string, claimedHotelId: string): Promise<string> {
  const rt = await prisma.roomType.findUnique({ where: { id: roomTypeId }, select: { hotelId: true } });
  if (!rt || rt.hotelId !== claimedHotelId) throw new DomainError("NOT_FOUND", "Oda tipi bulunamadı.");
  return rt.hotelId;
}

export async function GET(req: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(req.url).searchParams.get("hotelId"), "MB-TAN", "V");
    return { assignments: await listRoomTypeSetups(hotelId), selectedHotelId: hotelId };
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(req, keySchema);
    const hotelId = await resolveHotel(body.roomTypeId, body.hotelId);
    await assertCan(ctx, "MB-TAN", "O", hotelId);
    const assignment = await assignRoomTypeSetup({ ...body, hotelId }, auditCtxOf(ctx, req, hotelId));
    return { success: true, assignment };
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    const key = parseQuery(new URL(req.url).searchParams, keySchema);
    const hotelId = await resolveHotel(key.roomTypeId, key.hotelId);
    await assertCan(ctx, "MB-TAN", "D", hotelId);
    return removeRoomTypeSetup({ ...key, hotelId }, auditCtxOf(ctx, req, hotelId));
  });
}
