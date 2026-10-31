import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { waiterCalls } from "@/modules/order/server/waiterCalls";
import CallsClient from "./CallsClient";

export default async function CallsPage() {
  const ctx = await requireUser();
  if (!ctx.session.outletId || !(await can(ctx, "QM-CAG", "V", ctx.session.hotelId))) redirect("/secim");
  return <CallsClient outletId={ctx.session.outletId} initial={await waiterCalls.listOpen(ctx, ctx.session.outletId)} />;
}
