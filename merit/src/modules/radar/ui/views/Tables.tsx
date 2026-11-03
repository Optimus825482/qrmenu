"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { orderStatusLabel, tableCardModel, type TableCard } from "../../labels";
import type { RadarState } from "../../state";
import { usePulse } from "../useRadar";

type Outlet = NonNullable<RadarState["layers"]["order"]>["outlets"][number];

const CALL_LABELS = { GARSON: "Garson çağrısı", HESAP: "Hesap isteği", DIGER: "Çağrı" } as const;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)} dk ${String(s % 60).padStart(2, "0")} sn`;
};

function Card({ table, now, selected, onSelect }: { table: TableCard; now: number; selected: boolean; onSelect(): void }) {
  const m = tableCardModel(table, now);
  const ref = usePulse<HTMLButtonElement>(`table:${table.tableId}`);
  return (
    <button
      ref={ref}
      type="button"
      className="rd-card"
      data-tone={m.tone}
      data-table-id={table.tableId}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="rd-card-label">{table.label}</span>
      <span>{m.statusText}</span>
      <span className="rd-card-badges">
        {m.badges.map((b) => (
          <span key={b} className="rd-badge" data-tone={m.tone}>
            {b === "Çağrı" ? <Icon name="call" size={11} /> : null}
            {b}
            {b === "Çağrı" && m.callSeconds !== undefined ? ` ${m.callSeconds} sn` : ""}
          </span>
        ))}
      </span>
      <span className="rd-card-waiter">{m.waiter}</span>
    </button>
  );
}

function Detail({ table, now, onClose }: { table: TableCard; now: number; onClose(): void }) {
  const m = tableCardModel(table, now);
  return (
    <section className="rd-panel" aria-label={`Masa ${table.label} ayrıntısı`}>
      <div className="rd-row">
        <h3>Masa {table.label}</h3>
        <button type="button" className="rd-link" onClick={onClose}>
          Kapat
        </button>
      </div>
      <p>
        Durum: <strong>{m.statusText}</strong>
      </p>
      <p>Garson: {m.waiter}</p>
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
          {CALL_LABELS[table.call.type]} · {m.callSeconds} sn
        </p>
      ) : (
        <p className="rd-muted">Açık çağrı yok.</p>
      )}
      {m.guestPresent ? <p>Misafir masada (son 15 dk içinde QR okutuldu).</p> : null}
    </section>
  );
}

export type TablesProps = {
  view: RadarState;
  now: number;
  outletId?: string;
  onSelectOutlet(outletId: string): void;
};

/** Masa: outlet picker, area grids of table cards and a read-only side panel (nothing here changes an order). */
export function Tables({ view, now, outletId, onSelectOutlet }: TablesProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const outlets: Outlet[] = view.layers.order?.outlets ?? [];
  if (outlets.length === 0) return <EmptyState title="Bu otelde QR Sipariş kapalı." />;

  const outlet = outlets.find((o) => o.outletId === outletId) ?? outlets[0];
  const tables = outlet.areas.flatMap((a) => a.tables);
  const sel = selected ? tables.find((t) => t.tableId === selected) : undefined;

  return (
    <div>
      <div className="rd-select-row">
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
        {!outlet.orderingEnabled ? (
          <span className="rd-badge" data-tone="warn">
            <Icon name="ban" size={12} />
            Sipariş alımı kapalı
          </span>
        ) : null}
      </div>
      <div className="rd-tables">
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
                      onSelect={() => setSelected(t.tableId === selected ? null : t.tableId)}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
        {sel ? <Detail table={sel} now={now} onClose={() => setSelected(null)} /> : <div />}
      </div>
    </div>
  );
}
