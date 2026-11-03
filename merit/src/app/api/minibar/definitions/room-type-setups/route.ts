import { z } from "zod";
import { handle, parseBody, parseQuery, selectHotel } from "@/modules/minibar/server/apiAuthHelper";
import { assignOne, listAssignments, set, unassignOne } from "@/modules/minibar/server/roomTypeSetups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const keySchema = z.object({
  hotelId: z.string().min(1).max(64),
  roomTypeId: z.string().min(1).max(64),
  setupId: z.string().min(1).max(64),
});
const listSchema = keySchema.omit({ setupId: true }).extend({ setupIds: z.array(z.string().max(64)).max(200) });

export async function GET(req: Request) {
  return handle(async (ctx) => {
    const hotelId = await selectHotel(ctx, new URL(req.url).searchParams.get("hotelId"), "MB-TAN", "V");
    return { assignments: await listAssignments(ctx, hotelId), selectedHotelId: hotelId };
  });
}

/** Adds one setup to the room type (current list plus the setup). */
export async function POST(req: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(req, keySchema);
    await assignOne(ctx, body.hotelId, body.roomTypeId, body.setupId);
    return { success: true };
  });
}

/** Replaces the room type's whole setup list; an empty list removes every assignment. */
export async function PUT(req: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(req, listSchema);
    await set(ctx, body.hotelId, body.roomTypeId, body.setupIds);
    return { success: true };
  });
}

/** Removes one setup from the room type (current list minus the setup). */
export async function DELETE(req: Request) {
  return handle(async (ctx) => {
    const key = parseQuery(new URL(req.url).searchParams, keySchema);
    await unassignOne(ctx, key.hotelId, key.roomTypeId, key.setupId);
    return { success: true, message: "Setup ataması kaldırıldı." };
  });
}
