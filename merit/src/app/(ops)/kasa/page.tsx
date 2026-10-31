import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { tableAssignments } from "@/modules/order/server/tableAssignments";
import CashierAssignments from "./CashierAssignments";

export default async function CashierPage() {
  const ctx = await requireUser();
  if (!ctx.session.outletId || !(await can(ctx, "QS-KAS", "V", ctx.session.hotelId))) redirect("/secim");
  const outletId = ctx.session.outletId;
  const [tables, canEdit, members] = await Promise.all([
    tableAssignments.listForOutlet(ctx, outletId),
    can(ctx, "QS-KAS", "D", ctx.session.hotelId),
    prisma.outletMember.findMany({
      where: { outletId, isActive: true, user: { isActive: true, role: { code: "R-GAR" } } },
      select: { user: { select: { id: true, fullName: true } } },
      orderBy: { user: { fullName: "asc" } },
    }),
  ]);
  return <section className="space-y-4">
    <div><h1 className="text-xl font-semibold">Masalar</h1><p className="text-sm text-muted">Masa atamalarını yönetin.</p></div>
    <CashierAssignments tables={tables} waiters={members.map(({ user }) => user)} canEdit={canEdit} />
  </section>;
}
