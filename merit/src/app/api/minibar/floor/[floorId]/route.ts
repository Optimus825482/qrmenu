import { handle, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { floorOccupancy } from "@/modules/minibar/server/floorPlan";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  day: z.string().max(10).optional(),
  filter: z.enum(["ALL", "DOLU", "BOS", "GIRIS", "CIKIS"]).optional(),
});

/** One floor; the floor decides the hotel (the service rejects floors outside the user's hotels). */
export async function GET(request: Request, props: { params: Promise<{ floorId: string }> }) {
  return handle(async (ctx) => {
    const { floorId } = await props.params;
    const q = parseQuery(new URL(request.url).searchParams, querySchema);
    return floorOccupancy(ctx, floorId, { ...(q.day ? { day: q.day } : {}), ...(q.filter ? { filter: q.filter } : {}) });
  });
}
