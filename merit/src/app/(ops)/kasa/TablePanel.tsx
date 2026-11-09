"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { TONES, orderTone } from "@/components/ui/statusTone";
import { formatPrice } from "@/lib/formatPrice";
import type { PanelOrder } from "@/modules/order/server/actions/pos";
import type { BoardTable } from "./TableBoard";

export type { PanelOrder };
export type PanelCall = { id: string; type: string; note: string | null; ageSec: number };

export type TablePanelProps = {
  table: BoardTable;
  orders: PanelOrder[];
  calls: PanelCall[];
  waiters: { id: string; fullName: string }[];
  capabilities: { approve: boolean; assign: boolean; reprint: boolean; createOrder: boolean };
  currency: string;
  pricesShown: boolean;
  layout: "side" | "sheet";
  onClose(): void;
  /** Eylemler (hepsi `KasaClient.act` içinden geçer; hata/yenileme orada). */
  onApprove(order: PanelOrder): void;
  onReject(order: PanelOrder): void;
  onReprint(order: PanelOrder): void;
  onResolveCall(call: PanelCall): void;
  /** `null` = atamayı kaldır. */
  onAssign(userId: string | null): void;
  onCreateOrder(): void;
  onClearTable?(tableId: string): void;
  loading?: boolean;
  busy?: boolean;
};

const STATUS_LABEL: Record<string, string> = { GONDERILDI: "Onay bekliyor", ONAYLANDI: "Hazırlanıyor", HAZIR: "Hazır" };

const minutes = (iso: string, now: number): string => `${Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))} dk`;

export default function TablePanel({ table, orders, calls, waiters, capabilities, currency, pricesShown, layout, onClose, onApprove, onReject, onReprint, onResolveCall, onAssign, onCreateOrder, onClearTable, loading = false, busy = false }: TablePanelProps) {
  const [editing, setEditing] = useState(false);
  const [waiterId, setWaiterId] = useState(table.waiter?.id ?? "");
  // Yaş metni için bir kez alınan zaman (render saf kalsın); liste yenilenince panel yeniden bağlanır.
  const [now] = useState(() => Date.now());
  const labelId = `panel-${table.id}`;
  const body = (
    <>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id={labelId} className="text-2xl font-extrabold">{table.label}</h2>
            {table.isOccupied ? (
              <span className="rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] px-2 py-0.5 text-xs font-bold border border-[var(--accent)]">
                Dolu
              </span>
            ) : (
              <span className="rounded-full bg-[var(--surface-sunken)] text-muted px-2 py-0.5 text-xs font-semibold">
                Boş
              </span>
            )}
          </div>
          {table.areaLabel ? <p className="text-sm text-muted">{table.areaLabel}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {onClearTable && table.isOccupied ? (
            <button
              type="button"
              className="pos-btn"
              disabled={busy}
              onClick={() => onClearTable(table.id)}
              title="Masayı boş duruma getir"
            >
              <Icon name="check" size={18} />
              Masayı Boşa Al
            </button>
          ) : null}
          <button type="button" className="pos-btn" aria-label="Paneli kapat" onClick={onClose}>
            <Icon name="close" size={24} />
          </button>
        </div>
      </header>

      <section aria-label="Garson" className="mt-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Icon name="user" size={20} />
          {table.waiter ? <strong>{table.waiter.fullName}</strong> : <span className="pos-unassigned">Atanmadı</span>}
          {capabilities.assign && !editing ? (
            <button type="button" className="pos-btn ml-auto" onClick={() => { setWaiterId(table.waiter?.id ?? ""); setEditing(true); }}>
              Değiştir
            </button>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-2 grid gap-2">
            <label className="grid gap-1 text-sm font-medium">
              Garson
              <select aria-label="Garson" value={waiterId} onChange={(e) => setWaiterId(e.target.value)} className="rounded-[var(--radius-m)] border border-border bg-surface px-3 text-base" style={{ minHeight: "var(--tap-action)" }}>
                <option value="">Atanmadı</option>
                {waiters.map((w) => <option key={w.id} value={w.id}>{w.fullName}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="pos-btn" disabled={busy} onClick={() => { onAssign(waiterId || null); setEditing(false); }}>
                Ata
              </button>
              {table.waiter ? (
                <button type="button" className="pos-btn" data-danger disabled={busy} onClick={() => { onAssign(null); setEditing(false); }}>
                  Atamayı kaldır
                </button>
              ) : null}
              <button type="button" className="pos-btn" onClick={() => setEditing(false)}>Vazgeç</button>
            </div>
          </div>
        ) : null}
      </section>

      <section data-guide="adisyon" aria-label="Açık siparişler" className="mt-3 grid gap-3 border-t border-border pt-3">
        <h3 className="text-base font-bold">Açık siparişler</h3>
        {loading && orders.length === 0 ? <p className="text-sm text-muted" role="status">Siparişler yükleniyor…</p> : null}
        {!loading && orders.length === 0 ? <p className="text-sm text-muted">Bu masada açık sipariş yok.</p> : null}
        {orders.map((order) => {
          const tone = TONES[orderTone(order.status)];
          const total = order.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.qty, 0);
          return (
            <article key={order.id} aria-label={`Sipariş #${order.orderNo}`} className="grid gap-2 rounded-[var(--radius-m)] border-2 p-3" style={{ borderColor: tone.fg, background: tone.bg, borderStyle: tone.border === "dashed" ? "dashed" : tone.border === "double" ? "double" : "solid", borderWidth: tone.border === "thick" ? 4 : tone.border === "double" ? 6 : 2 }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-lg">#{order.orderNo}</strong>
                <span className="text-sm font-bold" style={{ color: tone.fg }}>{STATUS_LABEL[order.status] ?? tone.label}</span>
                <span className="text-sm text-muted">{minutes(order.createdAt, now)}</span>
              </div>
              <ul className="grid gap-1 text-base">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span>{item.qty} × {item.name}</span>
                    {pricesShown && order.pricesShown && item.unitPrice !== null ? <span className="text-sm">{formatPrice(item.unitPrice * item.qty, currency)}</span> : null}
                  </li>
                ))}
              </ul>
              {order.note ? <p className="text-sm"><strong>Not:</strong> {order.note}</p> : null}
              {pricesShown && order.pricesShown && total > 0 ? <p className="text-sm font-bold">Toplam: {formatPrice(total, currency)}</p> : null}
              <div className="flex flex-wrap gap-2">
                {order.status === "GONDERILDI" && capabilities.approve && order.canApprove ? (
                  <>
                    <button type="button" className="pos-btn" data-primary disabled={busy} onClick={() => onApprove(order)}>
                      <Icon name="check" size={24} />
                      Onayla
                    </button>
                    <button type="button" className="pos-btn" data-danger disabled={busy} onClick={() => onReject(order)}>
                      Reddet
                    </button>
                  </>
                ) : null}
                {order.status !== "GONDERILDI" && capabilities.reprint ? (
                  <button type="button" className="pos-btn" disabled={busy} onClick={() => onReprint(order)}>
                    <Icon name="printer" size={20} />
                    Fiş yeniden bas
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      {calls.length > 0 ? (
        <section aria-label="Masa çağrıları" className="mt-3 grid gap-2 border-t border-border pt-3">
          <h3 className="text-base font-bold">Çağrılar</h3>
          {calls.map((call) => (
            <div key={call.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-m)] border-2 p-2" style={{ borderColor: "var(--danger)", background: "var(--danger-bg)" }}>
              <Icon name="bell" size={20} />
              <span className="font-semibold">{call.type}</span>
              {call.note ? <span className="text-sm">{call.note}</span> : null}
              <button type="button" className="pos-btn ml-auto" disabled={busy} onClick={() => onResolveCall(call)}>
                Yanıtla
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {capabilities.createOrder ? (
        <div className="mt-3 border-t border-border pt-3">
          <button type="button" className="pos-btn" data-primary onClick={onCreateOrder}>
            <Icon name="plus" size={24} />
            Yeni adisyon
          </button>
        </div>
      ) : null}
    </>
  );
  return layout === "sheet" ? (
    <div role="dialog" aria-modal="false" aria-labelledby={labelId} className="pos-panel" data-layout="sheet">
      {body}
    </div>
  ) : (
    <aside aria-labelledby={labelId} className="pos-panel" data-layout="side">
      {body}
    </aside>
  );
}
