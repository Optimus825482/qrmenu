import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { list, type MenuTreeNode } from "@/modules/menu/server/menuTree";
import { denyScreen } from "@/modules/minibar/server/pageGuard";
import OdaServisiMenuClient from "./OdaServisiMenuClient";

const SCREEN = "RO-TAL";

/**
 * The room-service menu of the session hotel for the room-service team: a category tree with prices where
 * a sold-out item is marked and put back. Same gate and outlet as the requests board (RO-TAL view, the
 * hotel's single ODA_SERVISI outlet); marking needs RO-TAL "D", which the server re-checks on every change
 * (menuTree.setAvailable).
 */
export default async function OdaServisiMenuPage() {
  const ctx = await requireUser();
  const hotelId = ctx.session.hotelId;
  if (!hotelId) redirect("/secim");

  const [viewOk, canEdit] = await Promise.all([can(ctx, SCREEN, "V", hotelId), can(ctx, SCREEN, "D", hotelId)]);
  if (!viewOk) denyScreen(SCREEN);

  const outlet = await prisma.outlet.findFirst({
    where: { hotelId, type: "ODA_SERVISI" },
    select: { id: true, hotel: { select: { name: true } } },
  });
  if (!outlet) redirect("/secim");

  let initial: MenuTreeNode[] | null = null;
  let loadError: string | null = null;
  try {
    initial = await list(ctx, outlet.id);
  } catch (error: unknown) {
    loadError = error instanceof Error ? error.message : "Menü yüklenemedi";
  }

  return (
    <OdaServisiMenuClient
      key={outlet.id}
      outletId={outlet.id}
      hotelName={outlet.hotel.name}
      initialNodes={initial}
      loadError={loadError}
      canEdit={canEdit}
    />
  );
}
