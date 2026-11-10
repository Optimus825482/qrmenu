"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { playCue } from "@/components/pos/soundGate";
import { useSound } from "@/components/ops/useSound";
import { kdsBoardAction, markReadyAction, startPrepAction, undoReadyAction } from "@/modules/order/actions/orders";
import { reprintKitchenAction } from "@/modules/order/actions/printJobs";
import type { KdsBoard, KdsOrder } from "@/modules/order/server/kds";
import { notify } from "@/shell/notify";
import { useSse } from "@/shell/useSse";
import { RoutineCard } from "@/components/guide/RoutineCard";
import { showOpsNotification } from "@/components/ops/opsNotification";
import { NotificationPermissionGate } from "@/components/ops/NotificationPermissionGate";
import KdsColumn from "./KdsColumn";
import "./kds.css";

const EVENTS = ["order.approved", "order.prep", "order.ready", "order.served", "order.cancelled", "realtime.resync"] as const;

function payloadOrderId(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "orderId" in payload) {
    const value = (payload as { orderId?: unknown }).orderId;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

export default function KdsClient({ outletId, board: initialBoard, canEdit, canPrint }: { outletId: string; board: KdsBoard; canEdit: boolean; canPrint: boolean }) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  // Ages follow the server clock: offset = server time at read - device time at receipt.
  const [clockOffset, setClockOffset] = useState(() => initialBoard.serverNow - Date.now());
  const [now, setNow] = useState(initialBoard.serverNow);
  const [error, setError] = useState("");
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const localReady = useRef(new Set<string>());
  useSound("new-order"); // ilk dokunuşta ses kapısını açar
  const refresh = useCallback(async () => {
    const result = await kdsBoardAction(outletId);
    if (result.ok) { setBoard(result.data); setClockOffset(result.data.serverNow - Date.now()); }
    else setError(result.error.message);
    router.refresh();
  }, [outletId, router]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + clockOffset), 1_000);
    return () => window.clearInterval(timer);
  }, [clockOffset]);
  // SSE bursts collapse into one refresh; a resync refreshes at once.
  const refreshTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);
  const scheduleRefresh = useCallback((immediate = false) => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refresh(), immediate ? 0 : 300);
  }, [refresh]);
  const { status } = useSse((event) => {
    if (event.type === "realtime.resync") { scheduleRefresh(true); return; }
    if (event.outletId !== outletId) return;
    if (event.type === "order.approved") {
      playCue("new-order");
      showOpsNotification("Mutfak: Yeni Sipariş", { body: "Hazırlanacak yeni sipariş KDS ekranına düştü." });
    } else if (event.type === "order.ready") {
      const id = payloadOrderId(event.payload);
      // Bu cihazda basılan "Hazır" için ses çalınmaz; başka cihazdakiler için çalınır.
      if (!(id && localReady.current.delete(id))) playCue("ready");
    }
    scheduleRefresh();
  }, EVENTS);

  // The "ready" echo of this device can only be matched while the stream is up: after a loss the pending marks
  // would never be consumed and would silence a later cue for the same order.
  useEffect(() => {
    if (status !== "open") localReady.current.clear();
  }, [status]);

  const setPending = (id: string, on: boolean) => setPendingIds((current) => {
    const next = new Set(current);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const act = useCallback(async (order: KdsOrder, action: "start" | "ready") => {
    setPending(order.id, true);
    try {
      if (action === "ready") localReady.current.add(order.id);
      const result = action === "start" ? await startPrepAction(order.id) : await markReadyAction(order.id);
      if (!result.ok) {
        localReady.current.delete(order.id);
        setError(result.error.message);
        playCue("error");
        await refresh();
        return;
      }
      setError("");
      await refresh();
      if (action === "ready") {
        notify.success(`#${order.orderNo} hazır`, {
          undo: async () => {
            const undone = await undoReadyAction(order.id);
            if (!undone.ok) throw new Error(undone.error.message);
            await refresh();
          },
        });
      }
    } finally {
      setPending(order.id, false);
    }
  }, [refresh]);
  const print = useCallback(async (order: KdsOrder) => {
    setPending(order.id, true);
    try {
      const result = await reprintKitchenAction({ orderId: order.id });
      if (!result.ok) { setError(result.error.message); playCue("error"); } else setError("");
    } finally {
      setPending(order.id, false);
    }
  }, []);

  return <section className="space-y-3">
    <NotificationPermissionGate screen="Şef / Mutfak" />
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h1 style={{ fontSize: 24, fontWeight: 700 }}>Mutfak ekranı</h1><p className="text-muted" style={{ fontSize: 16 }}>Siparişler canlı güncellenir.</p></div>
    <RoutineCard />
    {error ? <p role="alert" className="rounded-[var(--radius-m)] border border-danger bg-danger-bg p-3 font-semibold text-danger" style={{ fontSize: 16 }}>{error}</p> : null}
    <div className="kds-board" data-kds-board role="region" aria-label="Sipariş sütunları" tabIndex={0}>
      <KdsColumn title="Yeni" column="NEW" orders={board.columns.NEW} action="start" pendingIds={pendingIds} canEdit={canEdit} canPrint={canPrint} now={now} onAction={act} onPrint={print} />
      <KdsColumn title="Hazırlanıyor" column="PREP" orders={board.columns.PREP} action="ready" pendingIds={pendingIds} canEdit={canEdit} canPrint={canPrint} now={now} onAction={act} onPrint={print} />
      <KdsColumn title="Hazır" column="READY" orders={board.columns.READY} pendingIds={pendingIds} canEdit={canEdit} canPrint={canPrint} now={now} onAction={act} onPrint={print} />
    </div>
  </section>;
}
