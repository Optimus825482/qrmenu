"use client";

import type { MybarRow, MybarStage } from "@/modules/mybar/server/requests";
import { stageOf } from "@/modules/mybar/ui/staff/format";

/** Date shape of rows that crossed the Server Action boundary. */
export type MybarRowView = Omit<MybarRow, "createdAt" | "seenAt" | "completedAt" | "cancelledAt"> & {
  createdAt: string | Date;
  seenAt: string | Date | null;
  completedAt: string | Date | null;
  cancelledAt: string | Date | null;
};

export type MybarKpis = { pending: number; unseen: number; completedToday: number; cancelledToday: number };

export const STAGE_LABEL: Record<MybarStage, string> = {
  ONAY_BEKLIYOR: "Onay bekliyor",
  ONAYLANDI: "Onaylandı",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
};

export function formatWhen(value: string | Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("tr-TR", {
    timeZone: "Europe/Nicosia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Stage of the request (approval waiting / approved / completed / cancelled); `data-status` keeps the stored status. */
export function StatusBadge({ row }: { row: Pick<MybarRowView, "status" | "seenAt"> }) {
  const stage = stageOf(row);
  return (
    <span className="xp-mybar-badge" data-status={row.status} data-stage={stage}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

export function itemsSummary(row: Pick<MybarRow, "items">): string {
  const wanted = row.items.reduce((sum, it) => sum + it.requestedQty, 0);
  const given = row.items.reduce((sum, it) => sum + it.deliveredQty, 0);
  return `${wanted} → ${given}`;
}

/** "6 → 4" for the products collected from the room (asked → collected). */
export function removalsSummary(row: Pick<MybarRow, "removals">): string {
  const wanted = row.removals.reduce((sum, it) => sum + it.requestedQty, 0);
  const taken = row.removals.reduce((sum, it) => sum + it.removedQty, 0);
  return `${wanted} → ${taken}`;
}

export function MybarKpiStrip({ kpis }: { kpis: MybarKpis | null }) {
  const tile = (label: string, value: number | undefined) => (
    <div className="xp-mybar-kpi">
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
  return (
    <dl className="xp-mybar-kpis" aria-label="Özet" data-guide="mybar-kpi">
      {tile("Onay bekleyen", kpis?.unseen)}
      {tile("Onaylanan (tamamlanmamış)", kpis ? Math.max(0, kpis.pending - kpis.unseen) : undefined)}
      {tile("Bugün tamamlanan", kpis?.completedToday)}
      {tile("Bugün iptal", kpis?.cancelledToday)}
    </dl>
  );
}

/**
 * Detail of one request with its stage actions: approve, close as completed (both MB-PERS D) and cancel (A).
 * Handing over products item by item stays on the floor screens.
 */
export function MybarRequestDetail({
  row,
  canAct,
  canCancel,
  busy,
  onApprove,
  onComplete,
  onCancel,
}: {
  row: MybarRowView;
  canAct: boolean;
  canCancel: boolean;
  busy: boolean;
  onApprove: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const open = row.status === "BEKLEMEDE";
  return (
    <aside className="xp-mybar-detail" aria-label="Talep ayrıntısı" data-guide="mybar-detay">
      <h3>
        Oda {row.roomNumber} · {row.floorName} <StatusBadge row={row} />
      </h3>
      {row.removals.length > 0 ? (
        <>
          <h4>Odadan alınacak ürünler</h4>
          <table aria-label="Odadan alınacak ürünler">
            <thead>
              <tr>
                <th scope="col">Ürün</th>
                <th scope="col">İstenen</th>
                <th scope="col">Alınan</th>
                <th scope="col">Kalan</th>
              </tr>
            </thead>
            <tbody>
              {row.removals.map((it) => (
                <tr key={it.productId}>
                  <td>{it.name}</td>
                  <td>{it.requestedQty}</td>
                  <td>{it.removedQty}</td>
                  <td>{it.remainingQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <h4>Odaya eklenecek ürünler</h4>
      <table aria-label="Ürünler">
        <thead>
          <tr>
            <th scope="col">Ürün</th>
            <th scope="col">İstenen</th>
            <th scope="col">Eklenen</th>
            <th scope="col">Kalan</th>
          </tr>
        </thead>
        <tbody>
          {row.items.map((it) => (
            <tr key={it.productId}>
              <td>{it.name}</td>
              <td>{it.requestedQty}</td>
              <td>{it.deliveredQty}</td>
              <td>{it.remainingQty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl>
        <dt>Oluşturulma</dt>
        <dd>{formatWhen(row.createdAt)}</dd>
        <dt>Onay</dt>
        <dd>{row.seenAt ? `${formatWhen(row.seenAt)} · ${row.seenByName ?? "—"}` : "Henüz onaylanmadı"}</dd>
        {row.note ? (
          <>
            <dt>Misafir notu</dt>
            <dd>{row.note}</dd>
          </>
        ) : null}
        {row.noteTr && row.noteTr !== row.note ? (
          <>
            <dt>Not (Türkçe)</dt>
            <dd>{row.noteTr}</dd>
          </>
        ) : null}
        {row.status === "TAMAMLANDI" ? (
          <>
            <dt>Tamamlanma</dt>
            <dd>
              {formatWhen(row.completedAt)} · {row.completedByName ?? "—"}
              {row.closedWithMissing ? " · eksik ürünle" : ""}
            </dd>
            {row.closeNote ? <dd>{row.closeNote}</dd> : null}
          </>
        ) : null}
        {row.status === "IPTAL" ? (
          <>
            <dt>İptal</dt>
            <dd>
              {formatWhen(row.cancelledAt)} · {row.cancelledByName ?? "—"}
            </dd>
            {row.cancelNote ? <dd>{row.cancelNote}</dd> : null}
          </>
        ) : null}
      </dl>
      {open && (canAct || canCancel) ? (
        <div className="xp-mybar-actions">
          {canAct && !row.seenAt ? (
            <button type="button" className="xp-button" data-guide="mybar-onayla" disabled={busy} onClick={onApprove}>
              Talebi onayla
            </button>
          ) : null}
          {canAct ? (
            <button type="button" className="xp-button" data-guide="mybar-tamamla" disabled={busy} onClick={onComplete}>
              Tamamlandı olarak kapat
            </button>
          ) : null}
          {canCancel ? (
            <button type="button" className="xp-button" data-guide="mybar-iptal" disabled={busy} onClick={onCancel}>
              Talebi iptal et
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
