"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrderAction } from "@/modules/order/actions/orders";
import { recentOrdersAction } from "@/modules/order/actions/cashier";
import { reprintAction } from "@/modules/order/actions/printJobs";
import { notify } from "@/shell/notify";
import { askReason } from "@/components/ui/reason";
import { ORDER_CANCEL_REASONS, REASON_MIN_LENGTH } from "@/modules/order/ui/reasons";

type RecentOrder = { id: string; orderNo: number; status: string; createdAt: Date | string; table: { label: string } | null };
const STATUS_TEXT: Record<string, string> = { ONAYLANDI: "Onaylandı", HAZIR: "Hazır", SERVIS_EDILDI: "Servis edildi" };

export default function IptalClient({ outletId, initial, canCancel, canPrint }: { outletId: string; initial: RecentOrder[]; canCancel: boolean; canPrint: boolean }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const refresh = async () => {
    const result = await recentOrdersAction({ outletId });
    if (result.ok) setOrders(result.data as RecentOrder[]);
    else setError(result.error.message);
    router.refresh();
  };
  const askCancel = async (order: RecentOrder) => {
    setError("");
    const reason = await askReason({
      title: `#${order.orderNo} siparişini iptal et`,
      message: "Sipariş geri alınamaz biçimde iptal edilir.",
      reasons: ORDER_CANCEL_REASONS,
      minLength: REASON_MIN_LENGTH,
      confirmLabel: "İptal et",
      danger: true,
    });
    if (!reason) return;
    startTransition(async () => {
      const result = await cancelOrderAction(order.id, reason);
      if (!result.ok) { notify.error(result.error.message); return; }
      notify.success(`#${order.orderNo} siparişi iptal edildi`);
      await refresh();
    });
  };
  const print = (order: RecentOrder) => startTransition(async () => {
    const result = await reprintAction({ orderId: order.id });
    if (result.ok) notify.success(`#${order.orderNo} adisyonu yazdırma kuyruğuna gönderildi`);
    else notify.error(result.error.message);
  });

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sipariş iptali</h1>
        <p className="text-sm text-muted">Onaylanmış veya hazır siparişler iptal edilebilir. Servis edilen siparişler yalnız görüntülenir.</p>
      </div>
      {error ? <p role="status" className="text-sm font-semibold text-danger">{error}</p> : null}
      <div className="grid gap-3">
        {orders.length === 0 ? <p className="text-muted">İptal edilebilir son sipariş yok.</p> : orders.map((order) => (
          <article key={order.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-l)] border border-border bg-surface p-4">
            <div className="mr-auto">
              <h2 className="font-semibold">#{order.orderNo} · {order.table?.label ?? "Masa yok"}</h2>
              <p className="text-sm text-muted">{STATUS_TEXT[order.status] ?? order.status}</p>
            </div>
            {canPrint ? <button type="button" disabled={pending} onClick={() => print(order)} className="pos-btn">Adisyon yazdır</button> : null}
            {order.status === "SERVIS_EDILDI" ? <span className="text-sm text-muted">Düzeltme v1&apos;de yok</span> : <button type="button" disabled={!canCancel} onClick={() => void askCancel(order)} className="pos-btn" data-danger>İptal et</button>}
          </article>
        ))}
      </div>
    </section>
  );
}
