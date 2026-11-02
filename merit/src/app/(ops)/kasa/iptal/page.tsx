import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { cashier } from "@/modules/order/server/cashier";
import IptalClient from "./IptalClient";
import { denyScreen } from "@/modules/minibar/server/pageGuard";

export default async function IptalPage() {
  const ctx = await requireUser();
  if (!(await can(ctx, "QS-IPT", "V", ctx.session.hotelId))) denyScreen("QS-IPT");
  if (!ctx.session.outletId) redirect("/secim");
  return <IptalClient outletId={ctx.session.outletId} initial={await cashier.recentOrders(ctx, ctx.session.outletId)} canCancel={await can(ctx, "QS-IPT", "A", ctx.session.hotelId)} canPrint={await can(ctx, "QS-FIS", "O", ctx.session.hotelId)} />;
}
