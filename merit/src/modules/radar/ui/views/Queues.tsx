"use client";

import { PageMark, pageOf, type WallPaging } from "../WallPage";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import type { RadarState, StateOutlet } from "../../state";
import { usePulse } from "../useRadar";

const ageText = (iso: string | undefined, now: number): string => {
  if (!iso) return "—";
  const ms = Math.max(0, now - (Date.parse(iso) || now));
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "<1 dk";
  return `${m} dk`;
};

const clock = (iso: string | undefined): string => {
  if (!iso) return "yok";
  const t = Date.parse(iso);
  if (!t) return "yok";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(t));
};

const PRINTER_STATE_LABEL: Record<StateOutlet["printers"][number]["state"], string> = {
  HAZIR: "Hazır",
  SESSIZ: "Sessiz",
  HATA: "Hata",
};

function OutletRow({
  outlet,
  now,
  onSelect,
}: {
  outlet: StateOutlet;
  now: number;
  onSelect(outletId: string): void;
}) {
  const ref = usePulse<HTMLTableRowElement>(`outlet:${outlet.outletId}`);
  const q = outlet.queues;
  const kasaTone = q.kasa.count > 0 ? "warn" : "muted";
  const printTone = q.print.HATA > 0 ? "danger" : q.print.KUYRUKTA + q.print.BASILIYOR > 0 ? "info" : "muted";

  return (
    <tr
      ref={ref}
      className="rd-queue-row"
      data-outlet-id={outlet.outletId}
      data-anchor={`outlet:${outlet.outletId}`}
      tabIndex={0}
      onClick={() => onSelect(outlet.outletId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(outlet.outletId);
        }
      }}
    >
      <th scope="row" className="rd-queue-outlet">
        <span className="rd-link">{outlet.name}</span>
        {!outlet.orderingEnabled ? (
          <span className="rd-badge" data-tone="warn">
            Kapalı
          </span>
        ) : null}
      </th>
      <td>
        <span className="rd-badge" data-tone={kasaTone} data-testid={`queue-kasa-${outlet.outletId}`} data-anchor={`queue:${outlet.outletId}:kasa`}>
          {q.kasa.count} bekleyen
        </span>
        {q.kasa.count > 0 ? <span className="rd-muted rd-small"> · en eski {ageText(q.kasa.oldest, now)}</span> : null}
      </td>
      <td>
        <div className="rd-queue-chips">
          <span
            className="rd-badge"
            data-tone={q.kds.YENI.count > 0 ? "warn" : "muted"}
            data-testid={`queue-kds-yeni-${outlet.outletId}`}
            data-anchor={`queue:${outlet.outletId}:YENI`}
          >
            Yeni {q.kds.YENI.count}
          </span>
          <span
            className="rd-badge"
            data-tone={q.kds.HAZIRLANIYOR.count > 0 ? "info" : "muted"}
            data-anchor={`queue:${outlet.outletId}:HAZIRLANIYOR`}
          >
            Hazırlanıyor {q.kds.HAZIRLANIYOR.count}
          </span>
          <span
            className="rd-badge"
            data-tone={q.kds.HAZIR.count > 0 ? "success" : "muted"}
            data-anchor={`queue:${outlet.outletId}:HAZIR`}
          >
            Hazır {q.kds.HAZIR.count}
          </span>
        </div>
        {q.kds.YENI.oldest ? (
          <span className="rd-muted rd-small">En eski yeni: {ageText(q.kds.YENI.oldest, now)}</span>
        ) : null}
      </td>
      <td>
        <div className="rd-queue-chips" data-tone={printTone} data-anchor={`queue:${outlet.outletId}:print`}>
          <span>Kuyrukta {q.print.KUYRUKTA}</span>
          <span>· Basılıyor {q.print.BASILIYOR}</span>
          <span className="rd-badge" data-tone={q.print.HATA > 0 ? "danger" : "muted"}>
            Hata {q.print.HATA}
          </span>
        </div>
      </td>
      <td>
        {outlet.printers.length === 0 ? (
          <span className="rd-muted">Tanımlı yazıcı yok</span>
        ) : (
          <ul className="rd-list">
            {outlet.printers.map((p) => {
              const pTone = p.state === "HAZIR" ? "success" : "danger";
              return (
                <li key={p.printerId} className="rd-row">
                  <span>{p.name}</span>
                  <span className="rd-badge" data-tone={pTone}>
                    <Icon name={p.state === "HAZIR" ? "check" : "error"} size={11} />
                    {PRINTER_STATE_LABEL[p.state]} · {clock(p.lastSeenAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </td>
    </tr>
  );
}

export type QueuesProps = {
  view: RadarState;
  now: number;
  onOpenOutlet(outletId: string): void;
  /** Set on the wall: the outlets show one page at a time. */
  paging?: WallPaging;
};

/** Outlet rows on one wall page. */
const WALL_OUTLETS = 7;

/** V4 Kuyruklar: per-outlet Kasa, KDS, Print queue and Printer health summary (spec 2.2). */
export function Queues({ view, now, onOpenOutlet, paging }: QueuesProps) {
  const outlets = view.layers.order?.outlets ?? [];
  if (outlets.length === 0) return <EmptyState title="Bu otelde QR Sipariş kapalı." />;

  const paged = pageOf(outlets, WALL_OUTLETS, paging, now);

  return (
    <div className="rd-queues">
      <div className="overflow-x-auto">
      <table className="rd-table">
        <caption>Outlet kuyrukları ve yazıcı sağlığı</caption>
        <thead>
          <tr>
            <th scope="col">Outlet</th>
            <th scope="col">Kasa bekleyen</th>
            <th scope="col">KDS (Yeni / Hazırlanıyor / Hazır)</th>
            <th scope="col">Yazıcı kuyruğu</th>
            <th scope="col">Yazıcı sağlığı</th>
          </tr>
        </thead>
        <tbody>
          {paged.items.map((o) => (
            <OutletRow key={o.outletId} outlet={o} now={now} onSelect={onOpenOutlet} />
          ))}
        </tbody>
      </table>
      </div>
      <PageMark paged={paged} total={outlets.length} unit="outlet" />
    </div>
  );
}
