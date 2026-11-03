import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { requireUser } from "@/lib/auth";
import { listDnd } from "@/modules/minibar/server/dnd";

export const dynamic = "force-dynamic";

export default async function KatDndPage() {
  const ctx = await requireUser();
  const rows = await listDnd(ctx);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-5 text-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-warn">
            Rahatsız Etmeyin (DND)
          </span>
          <h1 className="text-xl font-bold text-text mt-0.5">DND Odalar</h1>
        </div>
        <Link
          href="/kat"
          style={{ minHeight: "var(--tap-action)" }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-text hover:bg-bg"
        >
          <Icon name="arrow-left" size={16} />
          Kat Planına Dön
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          Bugün için kayıtlı DND odası bulunmuyor.
        </div>
      ) : (
        <ul data-guide="dnd-listesi" className="space-y-2.5">
          {rows.map((r) => {
            const tone =
              r.status === "TAMAMLANDI"
                ? "border-ok/40 bg-ok/10 text-ok"
                : r.status === "EKSIK"
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-warn/40 bg-warn/10 text-warn";
            return (
              <li
                key={r.dndId}
                data-testid="kat-dnd-item"
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base font-bold text-text tabular-nums">
                      Oda {r.roomNumber}
                    </span>
                    <span className="text-xs text-muted">({r.floorName})</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${tone}`}>
                      {r.status}
                    </span>
                  </div>
                  <p data-guide="ikinci-kontrol" className="text-xs text-muted">
                    Kontrol sayısı:{" "}
                    <strong className="text-text tabular-nums">
                      {r.count}/{r.required}
                    </strong>{" "}
                    · Son kontrol:{" "}
                    {new Date(r.lastAt).toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <Link
                  href={`/kat/oda-kontrol/${r.roomId}`}
                  data-guide="tamamla"
                  style={{ minHeight: "var(--tap-action)" }}
                  className="inline-flex items-center gap-1 rounded-xl bg-accent px-3.5 py-2 text-xs font-bold text-white hover:opacity-95"
                >
                  Kontrol Et
                  <Icon name="arrow-right" size={14} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
