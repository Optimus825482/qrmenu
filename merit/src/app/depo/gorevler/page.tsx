import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { businessDate } from "@/lib/time";
import { listTaskItems, taskSummary } from "@/modules/minibar/server/tasks";

export const dynamic = "force-dynamic";

export default async function DepoGorevlerPage() {
  const ctx = await requireUser();
  const day = businessDate();
  const [summary, items] = await Promise.all([
    taskSummary(prisma, ctx.session.hotelId, day),
    listTaskItems(ctx),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6 text-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            Depo & Operasyon · {day}
          </span>
          <h1 className="text-xl font-bold text-text mt-0.5">Günlük Görevler</h1>
        </div>
        <Link
          href="/depo"
          style={{ minHeight: "var(--tap-action)" }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-text hover:bg-bg"
        >
          <Icon name="arrow-left" size={16} />
          Depo Panosuna Dön
        </Link>
      </div>

      <section
        data-testid="depo-gorevler-summary"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Toplam</p>
          <p className="mt-1 text-2xl font-bold text-text tabular-nums">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-ok/30 bg-ok/10 p-4">
          <p className="text-xs uppercase tracking-wider text-ok">Tamamlanan</p>
          <p className="mt-1 text-2xl font-bold text-ok tabular-nums">{summary.completed}</p>
        </div>
        <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4">
          <p className="text-xs uppercase tracking-wider text-warn">Bekleyen</p>
          <p className="mt-1 text-2xl font-bold text-warn tabular-nums">{summary.waiting}</p>
        </div>
        <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
          <p className="text-xs uppercase tracking-wider text-text">DND</p>
          <p className="mt-1 text-2xl font-bold text-accent tabular-nums">{summary.dnd}</p>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          Bugün için oluşturulmuş görev kalemi bulunmuyor.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((i) => {
            const tone =
              i.status === "TAMAMLANDI"
                ? "border-ok/40 bg-ok/10 text-ok"
                : i.status === "DND_BEKLIYOR"
                  ? "border-warn/40 bg-warn/10 text-warn"
                  : "border-accent/40 bg-accent/10 text-accent";
            return (
              <li
                key={i.itemId}
                data-testid="depo-gorevler-item"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-text tabular-nums">
                    Oda {i.roomNumber}
                  </span>
                  <span className="rounded-lg border border-border bg-bg px-2.5 py-0.5 text-xs font-medium text-muted">
                    {i.taskType}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${tone}`}>
                    {i.status}
                  </span>
                </div>
                <span className="text-xs text-muted">{i.floorName}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
