import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { kds } from "@/modules/order/server/kds";
import KdsClient from "./KdsClient";

export default async function KdsPage() {
  const ctx = await requireUser();
  if (!ctx.session.outletId || !(await can(ctx, "QS-KDS", "V", ctx.session.hotelId))) redirect("/secim");
  const outletId = ctx.session.outletId;

  try {
    const board = await kds.board(ctx, outletId);
    const canEdit = await can(ctx, "QS-KDS", "D", ctx.session.hotelId);
    const canPrint = await can(ctx, "QS-KDS", "O", ctx.session.hotelId);
    return <KdsClient key={outletId} outletId={outletId} board={board} canEdit={canEdit} canPrint={canPrint} />;
  } catch (error: unknown) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-2xl">
            🍳
          </div>
          <h1 className="text-xl font-bold text-text">Mutfak Ekranı (KDS) Kapalı</h1>
          <p className="mt-2 text-sm text-muted">
            {error instanceof Error ? error.message : "Bu outlet için Mutfak Ekranı (KDS) özelliği henüz etkinleştirilmedi."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <a
              href="/secim"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Farklı Outlet Seç
            </a>
            <a
              href="/cikis"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-xs font-medium text-muted hover:bg-bg"
            >
              Çıkış Yap
            </a>
          </div>
        </div>
      </main>
    );
  }
}
