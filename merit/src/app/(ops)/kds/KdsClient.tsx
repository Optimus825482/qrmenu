"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSound } from "@/components/ops/useSound";
import { kdsBoardAction, markReadyAction, startPrepAction } from "@/modules/order/actions/orders";
import { reprintKitchenAction } from "@/modules/order/actions/printJobs";
import type { KdsBoard, KdsOrder } from "@/modules/order/server/kds";
import { useSse } from "@/shell/useSse";
import KdsColumn from "./KdsColumn";

const EVENTS = ["order.approved", "order.prep", "order.ready", "order.served", "order.cancelled"] as const;

export default function KdsClient({ outletId, board: initialBoard, canEdit, canPrint }: { outletId: string; board: KdsBoard; canEdit: boolean; canPrint: boolean }) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [pending, startTransition] = useTransition();
  const newOrder = useSound("new-order");
  const refresh = useCallback(async () => {
    const result = await kdsBoardAction(outletId);
    if (result.ok) setBoard(result.data);
    else setError(result.error.message);
    router.refresh();
  }, [outletId, router]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useSse((event) => {
    if (event.outletId !== outletId) return;
    if (event.type === "order.approved") newOrder();
    void refresh();
  }, EVENTS);

  const act = (order: KdsOrder, action: "start" | "ready") => startTransition(async () => {
    const result = action === "start" ? await startPrepAction(order.id) : await markReadyAction(order.id);
    if (!result.ok) { setError(result.error.message); return; }
    setError("");
    await refresh();
  });
  const print = (order: KdsOrder) => startTransition(async () => {
    const result = await reprintKitchenAction({ orderId: order.id });
    if (!result.ok) setError(result.error.message);
    else setError("");
  });
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setError("Tam ekran açılamadı"); }
  };

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Mutfak ekranı</h1><p className="text-sm text-muted">Siparişler canlı güncellenir.</p></div><button type="button" onClick={() => void toggleFullscreen()} className="min-h-12 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium">{fullscreen ? "Tam ekrandan çık" : "Tam ekran"}</button></div>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <div className="grid gap-4 xl:grid-cols-3"><KdsColumn title="Yeni" orders={board.columns.NEW} action="start" pending={pending} canEdit={canEdit} canPrint={canPrint} now={now} onAction={act} onPrint={print} /><KdsColumn title="Hazırlanıyor" orders={board.columns.PREP} action="ready" pending={pending} canEdit={canEdit} canPrint={canPrint} now={now} onAction={act} onPrint={print} /><KdsColumn title="Hazır" orders={board.columns.READY} pending={pending} canEdit={canEdit} canPrint={canPrint} now={now} onAction={act} onPrint={print} /></div>
  </section>;
}
