import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { approvals } from "@/modules/order/server/approvals";
import { orders } from "@/modules/order/server/orders";
import { tableAssignments } from "@/modules/order/server/tableAssignments";
import { prisma } from "@/lib/prisma";
import { waiterCalls } from "@/modules/order/server/waiterCalls";
import GarsonClient from "./GarsonClient";
import { resolveCurrency } from "@/modules/menu/server/priceDisplay";
import { denyScreen } from "@/modules/minibar/server/pageGuard";

export const metadata: Metadata = { title: "Garson · Merit", manifest: "/api/manifest/garson" };

export default async function GarsonPage() {
  const ctx = await requireUser();
  if (!(await can(ctx, "QS-KUY", "V", ctx.session.hotelId))) denyScreen("QS-KUY");
  if (!ctx.session.outletId) redirect("/secim");
  const outletId = ctx.session.outletId;
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hasOrdering: true } });
  const canCreateOrder = Boolean(outlet?.hasOrdering) && await can(ctx, "QS-KUY", "O", ctx.session.hotelId);
  const [queue, tables, calls, openOrders, currency] = await Promise.all([
    approvals.visibleQueue(ctx, outletId),
    tableAssignments.myTables(ctx),
    // Barmen and butlers have no QM-CAG module: the page must still open for them.
    can(ctx, "QM-CAG", "V", ctx.session.hotelId).then((allowed) => (allowed ? waiterCalls.listOpen(ctx, outletId) : [])),
    orders.listForOutlet(ctx, outletId, { statuses: ["ONAYLANDI", "HAZIR"] }),
    resolveCurrency(ctx.session.hotelId),
  ]);
  const cards = queue.map((order) => ({ ...order, canApprove: false }));
  for (const card of cards) card.canApprove = await approvals.canApproveOrder(ctx, card);
  return <GarsonClient outletId={outletId} queue={cards} tables={tables} calls={calls} canCreateOrder={canCreateOrder} currency={currency} openOrders={openOrders.filter((order) => tables.some((table) => table.tableId === order.tableId))} />;
}
