import { pageHotelCtx } from "@/modules/minibar/server/selectedHotel";
import type { Metadata } from "next";
import { requireStaffLayout } from "@/components/staff/loadShellProps";
import { can } from "@/lib/rbac";
import { denyScreen } from "@/modules/minibar/server/pageGuard";
import { MybarRequestsWindow } from "@/shell/apps/MybarRequestsWindow";
import "@/shell/theme.css";

export const metadata: Metadata = { title: "MyBar Talepleri" };

export default async function DepoMybarPage() {
  const { ctx: sessionCtx } = await requireStaffLayout("/depo/mybar");
  const ctx = await pageHotelCtx(sessionCtx);
  const hotelId = ctx.session.hotelId;
  if (!(await can(ctx, "MB-PERS", "V", hotelId))) denyScreen("MB-PERS");

  return (
    <section className="depo-mybar p-4" aria-labelledby="depo-mybar-title">
      <h1 id="depo-mybar-title" className="mb-4 text-xl font-bold">MyBar Talepleri</h1>
      <MybarRequestsWindow key={hotelId} hotelId={hotelId} />
    </section>
  );
}
