import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { kds } from "@/modules/order/server/kds";
import KdsClient from "./KdsClient";

export default async function KdsPage() {
  const ctx = await requireUser();
  if (!ctx.session.outletId || !(await can(ctx, "QS-KDS", "V", ctx.session.hotelId))) redirect("/secim");
  const outletId = ctx.session.outletId;
  const board = await kds.board(ctx, outletId);
  const canEdit = await can(ctx, "QS-KDS", "D", ctx.session.hotelId);
  const canPrint = await can(ctx, "QS-KDS", "O", ctx.session.hotelId);
  return <KdsClient key={outletId} outletId={outletId} board={board} canEdit={canEdit} canPrint={canPrint} />;
}
