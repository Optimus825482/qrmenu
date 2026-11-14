"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { orderStatusLabel, tableCardModel, type TableCard } from "../../labels";
import type { RadarState } from "../../state";
import { DetailBubble } from "../DetailBubble";
import { usePulse } from "../useRadar";

type Outlet = NonNullable<RadarState["layers"]["order"]>["outlets"][number];

const CALL_LABELS = { GARSON: "Garson çağrısı", HESAP: "Hesap isteği", DIGER: "Çağrı" } as const;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)} dk ${String(s % 60).padStart(2, "0")} sn`;
};

function Card({
  table,
  now,
  selected,
  waiterAssignmentEnabled,
  occupancyMinutes,
  callOverdueSeconds,
  onSelect,
}: {
  table: TableCard;
  now: number;
  selected: boolean;
  waiterAssignmentEnabled?: boolean;
  occupancyMinutes?: number | null;
  callOverdueSeconds?: number;
  onSelect(): void;
}) {
  const m = tableCardModel(table, now, waiterAssignmentEnabled, occupancyMinutes, callOverdueSeconds);
  const ref = usePulse<HTMLButtonElement>(`table:${table.tableId}`);
  return (
    <button
      ref={ref}
      type="button"
      className="rd-card"
      data-tone={m.tone}
      data-table-id={table.tableId}
      data-anchor={`table:${table.tableId}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="rd-card-label">{table.label}</span>
      <span>{m.statusText}</span>
      <span className="rd-card-badges">
        {m.badges.map((b) => {
          const isCall = b === "Çağrı" || b.includes("Çağrı") || b.includes("Garson") || b.includes("Hesap");
          const isQr = b.startsWith("QR");
          return (
            <span
              key={b}
              className="rd-badge"
              data-tone={isCall && m.callOverdue ? "danger" : isCall ? "warn" : isQr ? "accent" : m.tone}
            >
              {isCall ? <Icon name="call" size={11} /> : isQr ? <Icon name="qr" size={11} /> : null}
              {b}
              {isCall && m.callSeconds !== undefined && b === "Çağrı" ? ` ${m.callSeconds} sn` : ""}
            </span>
          );
        })}
      </span>
      {m.waiter ? <span className="rd-card-waiter">{m.waiter}</span> : null}
    </button>
  );
}

function Detail({
  table,
  hotelId,
  now,
  waiterAssignmentEnabled,
  occupancyMinutes,
  callOverdueSeconds,
  onOpenApp,
  onClose,
}: {
  table: TableCard;
  hotelId: string;
  now: number;
  waiterAssignmentEnabled?: boolean;
  occupancyMinutes?: number | null;
  callOverdueSeconds?: number;
  onOpenApp?: (appId: string) => void;
  onClose(): void;
}) {
  const m = tableCardModel(table, now, waiterAssignmentEnabled, occupancyMinutes, callOverdueSeconds);
  const occLabel = occupancyMinutes === null || occupancyMinutes === 0 ? "kapalı" : `son ${occupancyMinutes ?? 40} dk`;
  return (
    <DetailBubble
      title={`Masa ${table.label}`}
      ariaLabel={`Masa ${table.label} ayrıntısı`}
      hotelId={hotelId}
      appTarget={{ screenCode: "QS-KUY", modulePrefix: "order." }}
      onOpenApp={onOpenApp}
      onClose={onClose}
    >
      <p>
        Durum: <strong>{m.statusText}</strong>
      </p>
      {m.waiter ? <p>Garson: {m.waiter}</p> : null}
      <h4>Siparişler</h4>
      {table.orders.length === 0 ? (
        <p className="rd-muted">Açık sipariş yok.</p>
      ) : (
        <ul className="rd-list">
          {table.orders.map((o) => (
            <li key={o.orderId} className="rd-row">
              <span>
                Sipariş {o.orderNo} · {orderStatusLabel(o.status, "MASA")}
                {o.escalated ? " · yükseltildi" : ""}
              </span>
              <span className="rd-muted">{mmss(now - (Date.parse(o.since) || now))}</span>
            </li>
          ))}
        </ul>
      )}
      <h4>Çağrı</h4>
      {table.call ? (
        <p>
          <Icon name="call" size={13} /> {CALL_LABELS[table.call.type]} · {m.callSeconds} sn{m.callOverdue ? " (Gecikti)" : ""}
        </p>
      ) : (
        <p className="rd-muted">Açık çağrı yok.</p>
      )}
      <h4>Masa Durumu & Aktivite</h4>
      {m.guestPresent ? (
        <p>
          <Icon name="qr" size={13} /> Dolu · {m.scanMinutes === 0 ? "Yeni aktivite" : `${m.scanMinutes} dk önce aktivite`} ({occLabel} aktif).
        </p>
      ) : table.scannedAt ? (
        <p className="rd-muted">Son aktivite: {Math.floor((now - (Date.parse(table.scannedAt) || now)) / 60_000)} dk önce</p>
      ) : (
        <p className="rd-muted">Aktif istek veya çağrı yok (Boş masa).</p>
      )}
    </DetailBubble>
  );
}

export type TablesProps = {
  view: RadarState;
  now: number;
  outletId?: string;
  onSelectOutlet(outletId: string): void;
  onOpenApp?(appId: string): void;
};

/** Masa: outlet picker, area grids of table cards and a read-only side panel (nothing here changes an order). */
export function Tables({ view, now, outletId, onSelectOutlet, onOpenApp }: TablesProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const outlets: Outlet[] = view.layers.order?.outlets ?? [];
  if (outlets.length === 0) return <EmptyState title="Bu otelde aktif QR Menü veya Masa bulunamadı." />;

  const outlet = outlets.find((o) => o.outletId === outletId) ?? outlets[0];
  const tables = outlet.areas.flatMap((a) => a.tables);
  const sel = selected ? tables.find((t) => t.tableId === selected) : undefined;

  return (
    <div>
      <div className="rd-select-row" data-anchor={`queue:${outlet.outletId}:kds`}>
        <label htmlFor="rd-outlet">Outlet</label>
        <select
          id="rd-outlet"
          className="rd-select"
          value={outlet.outletId}
          onChange={(e) => {
            setSelected(null);
            onSelectOutlet(e.target.value);
          }}
        >
          {outlets.map((o) => (
            <option key={o.outletId} value={o.outletId}>
              {o.name}
            </option>
          ))}
        </select>
        {outlet.hasMenu ? (
          <span className="rd-badge" data-tone="accent">
            <Icon name="qr" size={12} />
            QR Menü
          </span>
        ) : null}
        {!outlet.orderingEnabled || !outlet.hasOrdering ? (
          <span className="rd-badge" data-tone="warn">
            <Icon name="ban" size={12} />
            Sipariş alımı kapalı
          </span>
        ) : null}
      </div>
      <div className="rd-tables" data-has-detail={Boolean(sel)}>
        <div className="rd-areas">
          {tables.length === 0 ? <EmptyState title="Bu outlette masa tanımlı değil." /> : null}
          {outlet.areas
            .filter((a) => a.tables.length > 0)
            .map((a) => (
              <section key={a.areaId} aria-label={a.name}>
                <h3>{a.name}</h3>
                <div className="rd-area-grid">
                  {a.tables.map((t) => (
                    <Card
                      key={t.tableId}
                      table={t}
                      now={now}
                      selected={t.tableId === selected}
                      waiterAssignmentEnabled={outlet.waiterAssignmentEnabled}
                      occupancyMinutes={outlet.tableOccupancyMinutes}
                      callOverdueSeconds={view.config.callAlertSeconds || undefined}
                      onSelect={() => setSelected(t.tableId === selected ? null : t.tableId)}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
        {sel ? (
          <Detail
            table={sel}
            hotelId={view.hotelId}
            now={now}
            waiterAssignmentEnabled={outlet.waiterAssignmentEnabled}
            occupancyMinutes={outlet.tableOccupancyMinutes}
            callOverdueSeconds={view.config.callAlertSeconds || undefined}
            onOpenApp={onOpenApp}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
