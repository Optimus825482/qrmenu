import type { Metadata } from "next";
import { PersistentMybarModal } from "@/app/kat/components/PersistentMybarModal";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { list } from "@/modules/mybar/server/requests";
import { MybarList } from "@/modules/mybar/ui/staff/MybarList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MyBar Talepleri" };

/** MB-PERS: guest MyBar requests of the session hotel. Cancel is offered only with the `A` right. */
export default async function KatMybarPage() {
  const ctx = await requireUser();
  const hotelId = ctx.session.hotelId;
  const [page, canCancel] = await Promise.all([list(ctx, {}), can(ctx, "MB-PERS", "A", hotelId)]);
  return (
    <main className="min-h-screen bg-bg text-text pb-28">
      <PersistentMybarModal hotelId={hotelId} />
      <header className="border-b border-border bg-bg px-4 py-4">
        <h1 className="mx-auto max-w-3xl text-xl font-bold">MyBar Talepleri</h1>
        <p className="mx-auto max-w-3xl text-sm text-muted">Misafirlerin odalardan gönderdiği talepler.</p>
      </header>
      <MybarList initial={page.items} hotelId={hotelId} canCancel={canCancel} />
    </main>
  );
}
