import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { approvals } from "@/modules/order/server/approvals";
import { orders } from "@/modules/order/server/orders";
import { tableAssignments } from "@/modules/order/server/tableAssignments";
import { waiterCalls } from "@/modules/order/server/waiterCalls";
import GarsonClient from "./GarsonClient";

export const metadata: Metadata = { title: "Garson · Merit", manifest: "/api/manifest/garson" };

export default async function GarsonPage() {
  const ctx = await requireUser();
  if (!ctx.session.outletId || !(await can(ctx, "QS-KUY", "V", ctx.session.hotelId))) redirect("/secim");
  const outletId = ctx.session.outletId;
  const [queue, tables, calls, openOrders] = await Promise.all([
    approvals.visibleQueue(ctx, outletId),
    tableAssignments.myTables(ctx),
    waiterCalls.listOpen(ctx, outletId),
    orders.listForOutlet(ctx, outletId, { statuses: ["ONAYLANDI", "HAZIR"] }),
  ]);
  const cards = queue.map((order) => ({ ...order, canApprove: false }));
  for (const card of cards) card.canApprove = await approvals.canApproveOrder(ctx, card);
  return <GarsonClient outletId={outletId} queue={cards} tables={tables} calls={calls} openOrders={openOrders.filter((order) => tables.some((table) => table.tableId === order.tableId))} />;
}
