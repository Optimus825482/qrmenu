import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { listRoomServiceOrdersAction } from "@/modules/order/server/actions/roomServiceRecords";
import OdaServisiClient from "./OdaServisiClient";

export default async function OdaServisiPage() {
  const ctx = await requireUser();
  const hotelId = ctx.session.hotelId ?? ctx.hotelIds[0];
  if (!hotelId) redirect("/secim");

  const [hasView, canEdit, hotel, ordersRes, slaMinutes] = await Promise.all([
    can(ctx, "RO-TAL", "V", hotelId),
    can(ctx, "RO-TAL", "D", hotelId),
    prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { id: true, name: true },
    }),
    listRoomServiceOrdersAction({ hotelId, limit: 100 }),
    getSetting("rs.slaMinutes", hotelId),
  ]);

  // The permission matrix decides; no role-kind shortcut.
  if (!hasView) redirect("/secim");

  const initialOrders = ordersRes.ok ? ordersRes.data.orders : [];
  const initialStats = ordersRes.ok
    ? ordersRes.data.stats
    : {
        total: 0,
        pending: 0,
        approved: 0,
        onWay: 0,
        delivered: 0,
        cancelled: 0,
        totalRevenue: 0,
      };

  return (
    <OdaServisiClient
      hotelId={hotelId}
      hotelName={hotel?.name ?? "Oda Servisi"}
      initialOrders={initialOrders}
      initialStats={initialStats}
      canEdit={canEdit}
      slaMinutes={slaMinutes}
    />
  );
}
