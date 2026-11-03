import { memo } from "react";
import { Button } from "@/components/ui/Button";
import { formatAge, kdsTone, type AgeTone } from "@/modules/order/kdsTiming";
import type { KdsOrder } from "@/modules/order/server/kds";

export type KdsColumnId = "NEW" | "PREP" | "READY";

const TONE_WORD: Record<AgeTone, string> = { ok: "", warn: "Dikkat", late: "Geç" };

/** Süre sayacının başlangıcı: Hazır sütununda hazır olduğu an, diğerlerinde onay anı. */
export function ageSeconds(order: KdsOrder, column: KdsColumnId, now: number): number {
  const since = column === "READY" && order.readyAt ? order.readyAt : order.approvedAt;
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 1_000));
}

function KdsCardView({ order, column, now, action, pending, canEdit, canPrint, onAction, onPrint }: {
  order: KdsOrder;
  column: KdsColumnId;
  now: number;
  action?: "start" | "ready";
  /** Yalnız bu karttaki işlem bekliyor; diğer kartlar etkilenmez. */
  pending: boolean;
  canEdit: boolean;
  canPrint: boolean;
  onAction: (order: KdsOrder, action: "start" | "ready") => void;
  onPrint: (order: KdsOrder) => void;
}) {
  const actionLabel = action === "start" ? "Başla" : action === "ready" ? "Hazır" : undefined;
  const age = ageSeconds(order, column, now);
  const tone = kdsTone(age);
  return <article className="kds-card" data-tone={tone} aria-busy={pending || undefined}>
    <div className="flex items-start justify-between gap-2">
      <h3 className="kds-title">#{order.orderNo} · {order.tableLabel}</h3>
      <time dateTime={new Date(order.approvedAt).toISOString()} className="kds-age" data-tone={tone}>{TONE_WORD[tone] ? `${TONE_WORD[tone]} · ` : ""}{formatAge(age)}</time>
    </div>
    <ul className="kds-items mt-3 space-y-1">{order.items.map((item, index) => <li key={`${item.name}-${index}`}>
      <span><span className="kds-qty">{item.qty} ×</span> {item.name}</span>
      {item.note ? <span className="block text-muted" style={{ fontSize: 16 }}>Kalem notu: {item.note}</span> : null}
    </li>)}</ul>
    {order.note ? <p className="kds-note">Not: {order.note}</p> : null}
    {action && actionLabel ? <Button variant="primary" disabled={!canEdit || pending} onClick={() => onAction(order, action)} className="mt-4 w-full" style={{ minHeight: "var(--tap-pos)", fontSize: 22 }}>{actionLabel}</Button> : null}
    <Button disabled={!canPrint || pending} onClick={() => onPrint(order)} className="mt-2 w-full" style={{ minHeight: "var(--tap-std)", fontSize: 16 }}>Fiyatsız mutfak fişini yazdır</Button>
  </article>;
}

export default memo(KdsCardView);
