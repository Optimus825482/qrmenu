import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { businessDate } from "@/lib/time";
import { listTaskItems, taskSummary } from "@/modules/minibar/server/tasks";
import { GorevListesi } from "./GorevListesi";

export const dynamic = "force-dynamic";

export default async function DepoGorevlerPage() {
  const ctx = await requireUser();
  const day = businessDate();
  const [summary, items] = await Promise.all([
    taskSummary(prisma, ctx.session.hotelId, day),
    listTaskItems(ctx),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 text-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-sm font-semibold uppercase tracking-widest text-text">
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
        <GorevListesi
          items={items.map((i) => ({
            itemId: i.itemId,
            roomNumber: i.roomNumber,
            floorName: i.floorName,
            taskType: i.taskType,
            status: i.status,
          }))}
        />
      )}
    </div>
  );
}
