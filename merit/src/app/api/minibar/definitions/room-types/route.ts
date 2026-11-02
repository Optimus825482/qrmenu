import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import {
  auditCtxOf,
  handle,
  parseBody,
  selectHotel,
} from "@/modules/minibar/server/apiAuthHelper";
import {
  createRoomType,
  deleteRoomType,
  listRoomTypes,
  updateRoomType,
} from "@/modules/minibar/server/minibarDefinitionsService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  hotelId: z.string().min(1, "Otel ID zorunludur.").max(64),
  name: z.string().trim().min(1, "Oda tipi adı zorunludur.").max(100),
  cabinetCount: z.number().int().min(0).max(20).optional(),
  isActive: z.boolean().optional(),
});
const updateSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(100).optional(),
  cabinetCount: z.number().int().min(0).max(20).optional(),
  isActive: z.boolean().optional(),
});

/** The room type decides its hotel; the caller only names the room type. */
async function roomTypeHotel(id: string): Promise<string> {
  const rt = await prisma.roomType.findUnique({ where: { id }, select: { hotelId: true } });
  if (!rt) throw new DomainError("NOT_FOUND", "Oda tipi bulunamadı.");
  return rt.hotelId;
}

export async function GET(req: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(req.url).searchParams.get("hotelId"), "MB-TAN", "V");
    return { roomTypes: await listRoomTypes(hotelId), selectedHotelId: hotelId };
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(req, createSchema);
    await assertCan(ctx, "MB-TAN", "O", body.hotelId); // also rejects hotels outside the user's scope
    const roomType = await createRoomType(body, auditCtxOf(ctx, req, body.hotelId));
    return { success: true, roomType };
  });
}

export async function PUT(req: Request) {
  return handle(async (ctx) => {
    const { id, ...data } = await parseBody(req, updateSchema);
    const hotelId = await roomTypeHotel(id);
    await assertCan(ctx, "MB-TAN", "D", hotelId);
    const roomType = await updateRoomType(id, data, auditCtxOf(ctx, req, hotelId));
    return { success: true, roomType };
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Oda tipi ID zorunludur." }, { status: 400 });
    const hotelId = await roomTypeHotel(id);
    await assertCan(ctx, "MB-TAN", "D", hotelId);
    return deleteRoomType(id, auditCtxOf(ctx, req, hotelId));
  });
}
