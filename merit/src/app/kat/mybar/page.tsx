import { pageHotelCtx } from "@/modules/minibar/server/selectedHotel";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { list } from "@/modules/mybar/server/requests";
import { MybarList } from "@/modules/mybar/ui/staff/MybarList";
import { BackLink } from "@/components/staff/BackLink";
import { screenTitle } from "@/components/staff/screenTitle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MyBar Talepleri" };

/** MB-PERS: guest MyBar requests of the session hotel. Cancel is offered only with the `A` right. */
export default async function KatMybarPage() {
  const ctx = await pageHotelCtx(await requireUser());
  const hotelId = ctx.session.hotelId;
  const [page, canCancel] = await Promise.all([list(ctx, {}), can(ctx, "MB-PERS", "A", hotelId)]);
  return (
    <main className="min-h-screen bg-bg text-text pb-28">
      <header className="border-b border-border bg-bg px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <BackLink />
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{screenTitle("MB-PERS")}</h1>
            <p className="text-sm text-muted">Misafirlerin odalardan gönderdiği talepler.</p>
          </div>
        </div>
      </header>
      <MybarList initial={page.items} hotelId={hotelId} canCancel={canCancel} />
    </main>
  );
}
