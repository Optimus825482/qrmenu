import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { denyScreen } from "@/modules/minibar/server/pageGuard";
import { board, type CoveredBoard, type RoomBoard } from "@/modules/order/server/roomService/board";
import OdaServisiClient, { type RoomOpsTab } from "./OdaServisiClient";

export type OdaServisiSearch = { sekme?: string | string[] };

/** `?sekme=` -> the screen the tab needs; anything else (also "gecmis") is the full board. */
function tabOf(raw: string | string[] | undefined): RoomOpsTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "teslim" ? value : "tumu";
}

const TAB_SCREEN = { tumu: "RO-TAL", teslim: "RO-TES" } as const;

/**
 * Staff room-service board. The permission matrix decides everything: the tab needs its own screen
 * code (`?sekme=teslim` -> RO-TES, default RO-TAL) and every button flag
 * is computed here, never in the browser. The hotel's single ODA_SERVISI outlet is the target — no
 * "first hotel" fallback.
 */
export async function renderOdaServisi(searchParams: Promise<OdaServisiSearch>, forced?: RoomOpsTab) {
  const ctx = await requireUser();
  const tab = forced ?? tabOf((await searchParams).sekme);
  const hotelId = ctx.session.hotelId;
  if (!hotelId) redirect("/secim");

  const [viewOk, talepV, talepD, teslimD, teslimA, talepA, mybarV] = await Promise.all([
    can(ctx, TAB_SCREEN[tab], "V", hotelId),
    // Cross-hotel coverage band: the same right the covered read asserts (board.covered).
    can(ctx, "RO-TAL", "V", hotelId),
    can(ctx, "RO-TAL", "D", hotelId),
    can(ctx, "RO-TES", "D", hotelId),
    can(ctx, "RO-TES", "A", hotelId),
    can(ctx, "RO-TAL", "A", hotelId),
    // The read-only MyBar panel of the full board follows the MyBar screen itself.
    can(ctx, "MB-PERS", "V", hotelId),
  ]);
  if (!viewOk) denyScreen(TAB_SCREEN[tab]);

  const outlet = await prisma.outlet.findFirst({
    where: { hotelId, type: "ODA_SERVISI" },
    select: { id: true, name: true, hotel: { select: { name: true } } },
  });
  if (!outlet) redirect("/secim");

  let initial: RoomBoard | null = null;
  let loadError: string | null = null;
  try {
    initial = await board.get(ctx, outlet.id);
  } catch (error: unknown) {
    loadError = error instanceof Error ? error.message : "Pano yüklenemedi";
  }

  // Requests of the hotels this user covers (empty without an active grant). A failure never blocks the board.
  let covered: CoveredBoard | null = null;
  if (talepV) {
    try {
      covered = await board.covered(ctx);
    } catch {
      covered = null;
    }
  }

  return (
    <OdaServisiClient
      key={outlet.id}
      outletId={outlet.id}
      hotelName={outlet.hotel.name}
      tab={tab}
      initialBoard={initial}
      loadError={loadError}
      flags={{ talepD, teslimD, teslimA, talepA }}
      showMybar={mybarV}
      coverageEnabled={talepV}
      initialCovered={covered}
    />
  );
}

