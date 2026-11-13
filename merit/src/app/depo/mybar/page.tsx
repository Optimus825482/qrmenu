import { pageHotelCtx } from "@/modules/minibar/server/selectedHotel";
import type { Metadata } from "next";
import { requireStaffLayout } from "@/components/staff/loadShellProps";
import { can } from "@/lib/rbac";
import { denyScreen } from "@/modules/minibar/server/pageGuard";
import { MybarRequestsWindow } from "@/shell/apps/MybarRequestsWindow";
import "@/shell/theme.css";
import { BackLink } from "@/components/staff/BackLink";
import { screenTitle } from "@/components/staff/screenTitle";

export const metadata: Metadata = { title: "MyBar Talepleri" };

export default async function DepoMybarPage() {
  const { ctx: sessionCtx } = await requireStaffLayout("/depo/mybar");
  const ctx = await pageHotelCtx(sessionCtx);
  const hotelId = ctx.session.hotelId;
  if (!(await can(ctx, "MB-PERS", "V", hotelId))) denyScreen("MB-PERS");

  return (
    <section className="depo-mybar p-4" aria-labelledby="depo-mybar-title">
      <div className="mb-4 flex items-center gap-3">
        <BackLink />
        <h1 id="depo-mybar-title" className="text-xl font-bold">{screenTitle("MB-PERS")}</h1>
      </div>
      <MybarRequestsWindow key={hotelId} hotelId={hotelId} />
    </section>
  );
}
