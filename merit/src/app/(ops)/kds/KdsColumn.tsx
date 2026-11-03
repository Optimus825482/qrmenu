import { EmptyState } from "@/components/ui/EmptyState";
import type { KdsOrder } from "@/modules/order/server/kds";
import KdsCard, { type KdsColumnId } from "./KdsCard";

type Props = {
  title: string;
  column: KdsColumnId;
  orders: KdsOrder[];
  action?: "start" | "ready";
  pendingIds: ReadonlySet<string>;
  canEdit: boolean;
  canPrint: boolean;
  now: number;
  onAction: (order: KdsOrder, action: "start" | "ready") => void;
  onPrint: (order: KdsOrder) => void;
};

export default function KdsColumn({ title, column, orders, action, pendingIds, canEdit, canPrint, now, onAction, onPrint }: Props) {
  return <section aria-label={title} className="kds-col">
    <div className="mb-3 flex items-center justify-between gap-2"><h2 style={{ fontSize: 22, fontWeight: 700 }}>{title}</h2><span className="rounded-full border border-border bg-bg px-3 py-0.5 font-semibold" style={{ fontSize: 16 }}>{orders.length}</span></div>
    <div className="grid gap-3">{orders.length === 0 ? <EmptyState title="Sipariş yok" /> : orders.map((order) => <KdsCard key={order.id} order={order} column={column} now={now} action={action} pending={pendingIds.has(order.id)} canEdit={canEdit} canPrint={canPrint} onAction={onAction} onPrint={onPrint} />)}</div>
  </section>;
}
