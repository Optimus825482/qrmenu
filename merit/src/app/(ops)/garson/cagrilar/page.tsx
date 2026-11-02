import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { waiterCalls } from "@/modules/order/server/waiterCalls";
import CallsClient from "./CallsClient";
import { denyScreen } from "@/modules/minibar/server/pageGuard";

export default async function CallsPage() {
  const ctx = await requireUser();
  if (!(await can(ctx, "QM-CAG", "V", ctx.session.hotelId))) denyScreen("QM-CAG");
  if (!ctx.session.outletId) redirect("/secim");
  return <CallsClient outletId={ctx.session.outletId} initial={await waiterCalls.listOpen(ctx, ctx.session.outletId)} />;
}
