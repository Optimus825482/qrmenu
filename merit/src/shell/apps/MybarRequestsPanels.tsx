"use client";

import type { MybarRow } from "@/modules/mybar/server/requests";

/** Date shape of rows that crossed the Server Action boundary. */
export type MybarRowView = Omit<MybarRow, "createdAt" | "seenAt" | "completedAt" | "cancelledAt"> & {
  createdAt: string | Date;
  seenAt: string | Date | null;
  completedAt: string | Date | null;
  cancelledAt: string | Date | null;
};

export type MybarKpis = { pending: number; unseen: number; completedToday: number; cancelledToday: number };

export const STATUS_LABEL: Record<MybarRow["status"], string> = {
  BEKLEMEDE: "Beklemede",
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

export function StatusBadge({ status }: { status: MybarRow["status"] }) {
  return (
    <span className="xp-mybar-badge" data-status={status}>
      {STATUS_LABEL[status]}
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
      {tile("Bekleyen", kpis?.pending)}
      {tile("Görülmemiş", kpis?.unseen)}
      {tile("Bugün tamamlanan", kpis?.completedToday)}
      {tile("Bugün iptal", kpis?.cancelledToday)}
    </dl>
  );
}

/** Read-only detail of one request. Fulfilment happens on the floor side, so there is no such control here. */
export function MybarRequestDetail({
  row,
  canCancel,
  onCancel,
}: {
  row: MybarRowView;
  canCancel: boolean;
  onCancel: () => void;
}) {
  return (
    <aside className="xp-mybar-detail" aria-label="Talep ayrıntısı" data-guide="mybar-detay">
      <h3>
        Oda {row.roomNumber} · {row.floorName} <StatusBadge status={row.status} />
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
        <dt>Görülme</dt>
        <dd>{row.seenAt ? `${formatWhen(row.seenAt)} · ${row.seenByName ?? "—"}` : "Henüz görülmedi"}</dd>
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
            <dt>Kapatma</dt>
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
      {canCancel && row.status === "BEKLEMEDE" ? (
        <button type="button" className="xp-button" data-guide="mybar-iptal" onClick={onCancel}>
          Talebi iptal et
        </button>
      ) : null}
    </aside>
  );
}
