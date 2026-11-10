import "@/shell/mobile.css";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { denyScreen } from "@/modules/minibar/server/pageGuard";
import { KasaReports } from "./KasaReports";

/**
 * Sipariş raporları for an outlet session (e.g. Outlet Yöneticisi): the Rapor Merkezi catalogue in its mobile
 * layout. The reporting service pins OUTLET/MUTFAK sessions to their session outlet (scope.resolveScope).
 */
export default async function KasaReportsPage() {
  const ctx = await requireUser();
  if (!(await can(ctx, "QS-RAP", "V", ctx.session.hotelId))) denyScreen("QS-RAP");
  if (!ctx.session.outletId) redirect("/secim");
  return <KasaReports />;
}
