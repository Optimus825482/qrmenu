import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { FLOOR_WATCH_SCREEN, floorWatch, type FloorWatch } from "@/modules/minibar/server/floorWatch";
import { denyScreen } from "@/modules/minibar/server/pageGuard";
import MinibarTakipClient from "./MinibarTakipClient";

type Search = { otel?: string | string[] };

/**
 * Minibar Takip: today's minibar room checks on the floor grid of the Komuta Merkezi "Kat" view, read-only, for
 * the room-service team. `?otel=<hotel code>` opens another hotel (every hotel with the minibar module is
 * selectable); the gate is RO-MBT view in the session hotel.
 */
export default async function MinibarTakipPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireUser();
  const hotelId = ctx.session.hotelId;
  if (!hotelId) redirect("/secim");
  if (!(await can(ctx, FLOOR_WATCH_SCREEN, "V", hotelId))) denyScreen(FLOOR_WATCH_SCREEN);

  const raw = (await searchParams).otel;
  const wanted = Array.isArray(raw) ? raw[0] : raw;

  let initial: FloorWatch | null = null;
  let loadError: string | null = null;
  try {
    initial = await floorWatch.get(ctx, wanted);
  } catch (error: unknown) {
    loadError = error instanceof Error ? error.message : "Kat planı yüklenemedi";
  }

  return <MinibarTakipClient initial={initial} loadError={loadError} />;
}
