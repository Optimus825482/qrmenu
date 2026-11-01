import type { KdsOrder } from "@/modules/order/server/kds";
import KdsCard from "./KdsCard";

type Props = {
  title: string;
  orders: KdsOrder[];
  action?: "start" | "ready";
  pending: boolean;
  canEdit: boolean;
  now: number;
  onAction: (order: KdsOrder, action: "start" | "ready") => void;
};

export default function KdsColumn({ title, orders, action, pending, canEdit, now, onAction }: Props) {
  return <section aria-label={title} className="min-w-0 rounded-xl border border-border bg-surface p-3 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">{title}</h2><span className="rounded-full bg-bg px-2 py-0.5 text-sm text-muted">{orders.length}</span></div>
    <div className="grid gap-3">{orders.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">Sipariş yok.</p> : orders.map((order) => <KdsCard key={order.id} order={order} now={now} action={action} pending={pending} canEdit={canEdit} onAction={onAction} />)}</div>
  </section>;
}
