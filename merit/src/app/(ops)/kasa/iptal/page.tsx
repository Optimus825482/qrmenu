import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { cashier } from "@/modules/order/server/cashier";
import IptalClient from "./IptalClient";

export default async function IptalPage() {
  const ctx = await requireUser();
  if (!ctx.session.outletId || !(await can(ctx, "QS-IPT", "V", ctx.session.hotelId))) redirect("/secim");
  return <IptalClient outletId={ctx.session.outletId} initial={await cashier.recentOrders(ctx, ctx.session.outletId)} canCancel={await can(ctx, "QS-IPT", "A", ctx.session.hotelId)} canPrint={await can(ctx, "QS-FIS", "O", ctx.session.hotelId)} />;
}
