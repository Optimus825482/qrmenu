// Minibar Takip (RO-MBT): the read-only floor grid of today's minibar room checks for the room-service team.
// The rooms come from the radar's minibar layer, so a cell here and in the Komuta Merkezi "Kat" view can never
// disagree. Never writes.
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { loadEnv } from "@/modules/radar/server/config";
import { minibarLayer, type MinibarLayer } from "@/modules/radar/server/layers/minibar";

export const FLOOR_WATCH_SCREEN = "RO-MBT";

export type FloorWatchHotel = { id: string; code: string; name: string };

export type FloorWatch = {
  /** Hotels the viewer may switch between (minibar module on), by name. */
  hotels: FloorWatchHotel[];
  hotel: FloorWatchHotel;
  /** Server time of the read. */
  at: string;
  /** Business day shown, yyyy-MM-dd (Europe/Nicosia). */
  day: string;
  floors: MinibarLayer["floors"];
  /** Staff who checked a room today, with the task progress of the floors they worked on. */
  staff: { userId: string; done: number; total: number; lastAt?: string }[];
  /** userId -> full name of everyone referenced by `floors` and `staff`. */
  people: Record<string, string>;
};

/**
 * Hotels the page lists: every active hotel that runs the minibar module. The right is checked in the session
 * hotel only (RO-MBT view); the grid of another hotel is open to its holder on purpose, although that hotel is
 * outside `ctx.hotelIds`: the page shows room states and names, and changes nothing.
 */
async function hotels(): Promise<FloorWatchHotel[]> {
  return prisma.hotel.findMany({
    where: { isActive: true, modules: { some: { moduleKey: "MINIBAR", enabled: true } } },
    select: { id: true, code: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

/** The hotel `wanted` (id or code) names among the listed ones; anything else is the session hotel, then the first. */
export function pickFloorWatchHotel(
  list: readonly FloorWatchHotel[],
  wanted: string | undefined,
  sessionHotelId: string,
): FloorWatchHotel | undefined {
  return (
    (wanted ? list.find((h) => h.id === wanted || h.code === wanted) : undefined) ??
    list.find((h) => h.id === sessionHotelId) ??
    list[0]
  );
}

/** Today's floor grid of one hotel. `wanted` is a hotel id or code; unknown or absent = the session hotel. */
async function get(ctx: Ctx, wanted?: string, now: Date = new Date()): Promise<FloorWatch> {
  await assertCan(ctx, FLOOR_WATCH_SCREEN, "V", ctx.session.hotelId);
  const list = await hotels();
  const hotel = pickFloorWatchHotel(list, wanted, ctx.session.hotelId);
  if (!hotel) throw new DomainError("NOT_FOUND", "Minibar takibi açık bir otel bulunamadı");

  // `named`: this page exists to show who checked the room, whatever the viewer's role kind.
  const env = { ...(await loadEnv(ctx, hotel.id, now)), named: true };
  const { layer, people } = await minibarLayer(env);

  return {
    hotels: list,
    hotel,
    at: now.toISOString(),
    day: env.today,
    floors: layer.floors,
    staff: layer.supervisors.map((s) => ({
      userId: s.userId,
      done: s.done,
      total: s.total,
      ...(s.lastAt ? { lastAt: s.lastAt } : {}),
    })),
    people,
  };
}

export const floorWatch = { get };
