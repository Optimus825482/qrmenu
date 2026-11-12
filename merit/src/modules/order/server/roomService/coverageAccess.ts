import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { outletAllowed } from "../approvals";
import { coverage, type CoverageMode, type CoverageWindow } from "./coverage";

type Db = Prisma.TransactionClient;

/**
 * Would this session be let to the room-service desk of its OWN hotel by the outlet rule (`outletAllowed`)?
 * Coverage gives no extra power: a session that is bound to another outlet at home (a VIP waiter signed in at a
 * restaurant, say) cannot reach its own hotel's room-service requests, so it cannot reach a covered hotel's either.
 */
async function homeDeskAllowed(ctx: Ctx, db: Db): Promise<boolean> {
  const outlets = await db.outlet.findMany({
    where: { hotelId: ctx.session.hotelId, type: "ODA_SERVISI" },
    select: { id: true },
  });
  return outlets.some((o) => outletAllowed(ctx, o.id));
}

/**
 * What the session may do with the room-service requests of `hotelId` through cross-hotel coverage, at `now`:
 * `null` (nothing), IZLEME (see) or ISLEME (see and process). Always `null` for a hotel of the session's own
 * scope: the ordinary rules apply there and this function must not be used to widen or narrow them.
 */
export async function coveredMode(
  ctx: Ctx,
  hotelId: string,
  now: Date = new Date(),
  db: Db = prisma,
): Promise<CoverageMode | null> {
  if (ctx.hotelIds.includes(hotelId)) return null;
  const mode = await coverage.modeFor(ctx.user.id, hotelId, now, db);
  if (!mode) return null;
  return (await homeDeskAllowed(ctx, db)) ? mode : null;
}

/** Every covered hotel of the session with its mode (empty when the home desk is closed to the session). */
export async function coveredModes(ctx: Ctx, now: Date = new Date(), db: Db = prisma): Promise<Map<string, CoverageMode>> {
  const modes = await coverage.coveredHotels(ctx, now, db);
  if (modes.size === 0) return modes;
  return (await homeDeskAllowed(ctx, db)) ? modes : new Map();
}

/**
 * Coverage windows of an SSE connection (GET /api/sse): the same gate as the covered board (board.covered).
 * Nothing at all without RO-TAL view in the session hotel or when the home desk is closed to the session;
 * hotels of the session scope are left out; only unrevoked, unended grants are returned. A grant that starts
 * later is kept as a window: `matchesScope` compares every window with the clock at each event.
 */
export async function sseCoverage(ctx: Ctx, now: Date = new Date()): Promise<CoverageWindow[]> {
  if (!(await can(ctx, "RO-TAL", "V", ctx.session.hotelId))) return [];
  const windows = (await coverage.windowsFor(ctx.user.id, now)).filter((w) => !ctx.hotelIds.includes(w.hotelId));
  if (windows.length === 0) return [];
  return (await homeDeskAllowed(ctx, prisma)) ? windows : [];
}
