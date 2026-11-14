import { z } from "zod";
import { handle, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { listRoomChecks } from "@/modules/minibar/server/roomCheckAdminService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  hotelId: z.string().min(1).max(64).optional(),
  day: z.string().max(10).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  userId: z.string().min(1).max(64).optional(),
});

/** Oda Kontrol İşlemleri (MB-OKI): the room check records of all staff. No `hotelId` = every hotel the user may view. */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(request.url).searchParams, querySchema);
    return listRoomChecks(ctx, q);
  });
}
