import type { KdsOrder } from "@/modules/order/server/kds";

const elapsedClass = (approvedAt: Date | string, now: number) => {
  const minutes = Math.max(0, (now - new Date(approvedAt).getTime()) / 60_000);
  if (minutes < 5) return "bg-emerald-100 text-emerald-800";
  if (minutes < 10) return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-red-800";
};

const elapsedLabel = (approvedAt: Date | string, now: number) => {
  const seconds = Math.max(0, Math.floor((now - new Date(approvedAt).getTime()) / 1_000));
  return `${Math.floor(seconds / 60)} dk ${String(seconds % 60).padStart(2, "0")} sn`;
};

export default function KdsCard({ order, now, action, pending, canEdit, onAction }: {
  order: KdsOrder;
  now: number;
  action?: "start" | "ready";
  pending: boolean;
  canEdit: boolean;
  onAction: (order: KdsOrder, action: "start" | "ready") => void;
}) {
  const actionLabel = action === "start" ? "Başla" : action === "ready" ? "Hazır" : undefined;
  return <article className="rounded-xl border border-border bg-bg p-4 shadow-sm">
    <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">#{order.orderNo} · {order.tableLabel}</h3><time dateTime={new Date(order.approvedAt).toISOString()} className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${elapsedClass(order.approvedAt, now)}`}>{elapsedLabel(order.approvedAt, now)}</time></div>
    <ul className="mt-3 space-y-1 text-sm">{order.items.map((item, index) => <li key={`${item.name}-${index}`}><span className="font-medium">{item.name} × {item.qty}</span>{item.note ? <span className="block text-muted">Kalem notu: {item.note}</span> : null}</li>)}</ul>
    {order.note ? <p className="mt-3 rounded-lg bg-surface p-2 text-sm text-muted">Not: {order.note}</p> : null}
    {action && actionLabel ? <button type="button" disabled={!canEdit || pending} onClick={() => onAction(order, action)} className="mt-4 min-h-14 w-full rounded-lg bg-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{actionLabel}</button> : null}
  </article>;
}
