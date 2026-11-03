import { z } from "zod";
import { handle, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { listMyTransactions } from "@/modules/minibar/server/roomCheckService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  hotelId: z.string().max(64).optional(),
  day: z.string().max(10).optional(),
});

/** The user's own records (replacements, Sarfiyat Yok, MyBar fulfilment, DND marks). */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const q = parseQuery(new URL(request.url).searchParams, querySchema);
    return listMyTransactions(ctx, {
      ...(q.hotelId ? { hotelId: q.hotelId } : {}),
      ...(q.day ? { day: q.day } : {}),
    });
  });
}
