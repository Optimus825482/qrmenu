import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { approvals } from "@/modules/order/server/approvals";
import { cashier } from "@/modules/order/server/cashier";
import { waiterCalls } from "@/modules/order/server/waiterCalls";
import KasaClient from "./KasaClient";

export default async function CashierPage() {
  const ctx = await requireUser();
  if (!ctx.session.outletId || !(await can(ctx, "QS-KAS", "V", ctx.session.hotelId))) redirect("/secim");
  const outletId = ctx.session.outletId;
  const [board, queue, calls, canEdit, members, outlet] = await Promise.all([
    cashier.tableBoard(ctx, outletId),
    approvals.visibleQueue(ctx, outletId),
    waiterCalls.listOpen(ctx, outletId),
    can(ctx, "QS-KAS", "D", ctx.session.hotelId),
    prisma.outletMember.findMany({
      where: { outletId, isActive: true, user: { isActive: true } },
      select: { user: { select: { id: true, fullName: true } } },
      orderBy: { user: { fullName: "asc" } },
    }),
    prisma.outlet.findUnique({
      where: { id: outletId },
      select: { hasMenu: true, priceDisplay: true, name: true },
    }),
  ]);
  return (
    <KasaClient
      outletId={outletId}
      outletName={outlet?.name ?? "Outlet"}
      hasMenu={outlet?.hasMenu === true}
      initialPriceDisplay={outlet?.priceDisplay ?? "INHERIT"}
      board={board}
      queue={queue}
      calls={calls}
      waiters={members.map(({ user }) => user)}
      canEdit={canEdit}
    />
  );
}
