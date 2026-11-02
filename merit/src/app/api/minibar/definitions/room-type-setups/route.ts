import { z } from "zod";
import { assertCan } from "@/lib/rbac";
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

export async function GET(req: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(req.url).searchParams.get("hotelId"), "MB-TAN", "V");
    return { assignments: await listRoomTypeSetups(hotelId), selectedHotelId: hotelId };
  });
}

export async function POST(req: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(req, keySchema);
    await assertCan(ctx, "MB-TAN", "O", body.hotelId);
    const assignment = await assignRoomTypeSetup(body, auditCtxOf(ctx, req, body.hotelId));
    return { success: true, assignment };
  });
}

export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    const key = parseQuery(new URL(req.url).searchParams, keySchema);
    await assertCan(ctx, "MB-TAN", "D", key.hotelId);
    return removeRoomTypeSetup(key, auditCtxOf(ctx, req, key.hotelId));
  });
}
