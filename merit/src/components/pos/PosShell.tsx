"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DensityRoot } from "@/components/ui/Density";
import type { OutletTarget } from "@/components/ops/OutletSwitcher";
import { listOpenCallsAction } from "@/modules/order/actions/calls";
import { listQueueAction } from "@/modules/order/actions/orders";
import { useSse } from "@/shell/useSse";
import { FullscreenGate, useFullscreenGate } from "./FullscreenGate";
import { PosRail, type PosRailItem } from "./PosRail";
import { PosStatusBar } from "./PosStatusBar";
import { playCue, soundStore, unlockAudio } from "./soundGate";
import { usePrinterStatus, type PrinterState } from "./usePrinterStatus";
import "./pos.css";

export type { PosRailItem } from "./PosRail";

export type PosShellProps = {
  context: "kasa" | "kds";
  outletName: string;
  hotelName: string;
  fullName: string;
  rail: PosRailItem[];
  printer: { initial: PrinterState; href: string } | null;
  /** Ray rozetleri ve ses uyarıları için (kasa). */
  outletId?: string;
  targets?: OutletTarget[];
  /** Cihaz kurulumu önerisi gibi, tam ekran/ses/uyku kilidi düğmesine bağlanan içerik (OpsShell verir). */
  setup?: (api: { start: () => Promise<void> }) => ReactNode;
  children: ReactNode;
};

const COUNT_EVENTS = [
  "order.created",
  "order.approved",
  "order.rejected",
  "order.cancelled",
  "call.created",
  "call.resolved",
  "realtime.resync",
] as const;

/**
 * Dokunmatik POS kabuğu (kasa, KDS): solda 72 px ray, altta durum şeridi, `data-density="pos"`.
 * Tam ekran / uyku kilidi / ses tek bir kapı düğmesiyle (kullanıcı hareketi) istenir; hiçbiri zorunlu değildir.
 */
export function PosShell({ context, outletName, fullName, rail, printer, outletId, targets = [], setup, children }: PosShellProps) {
  const gate = useFullscreenGate();
  const { status } = useSse(() => {}, []);
  const printerStatus = usePrinterStatus(printer?.initial ?? "unknown");
  const [counts, setCounts] = useState<{ orders: number; calls: number } | null>(null);

  const refreshCounts = useCallback(async () => {
    if (context !== "kasa" || !outletId) return;
    const [queue, calls] = await Promise.all([listQueueAction(outletId), listOpenCallsAction(outletId)]);
    setCounts((current) => ({
      orders: queue.ok ? queue.data.length : (current?.orders ?? 0),
      calls: calls.ok ? calls.data.length : (current?.calls ?? 0),
    }));
  }, [context, outletId]);

  useEffect(() => {
    const id = setTimeout(() => void refreshCounts(), 0);
    return () => clearTimeout(id);
  }, [refreshCounts]);

  // Her dokunuş bir kullanıcı hareketidir: ses kapısını açar (kapı düğmesine basılmasa da).
  useEffect(() => {
    const arm = () => {
      if (soundStore.getState().state === "locked") void unlockAudio();
    };
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, []);

  useSse((event) => {
    if (context !== "kasa") return;
    if (event.outletId && outletId && event.outletId !== outletId) return;
    if (event.type === "order.created") playCue("new-order");
    else if (event.type === "call.created") playCue("call");
    void refreshCounts();
  }, COUNT_EVENTS);

  const items = useMemo(
    () =>
      rail.map((item) => {
        if (!counts) return item;
        if (item.id === "queue") return { ...item, badge: counts.orders };
        if (item.id === "calls") return { ...item, badge: counts.calls };
        return item;
      }),
    [rail, counts],
  );

  return (
    <DensityRoot density="pos">
      <div className="pos-shell" data-pos-context={context}>
        {context === "kds" ? null : <PosRail items={items} />}
        <main className="pos-main">
          {setup?.({ start: gate.start })}
          {gate.phase === "idle" ? <FullscreenGate onStart={() => void gate.start()} onDismiss={gate.dismiss} /> : null}
          {children}
        </main>
        <PosStatusBar
          connection={status}
          printer={printer ? { ...printerStatus, href: printer.href } : null}
          phase={gate.phase}
          wake={{ supported: gate.wake.supported, held: gate.wake.held, wanted: gate.wakeWanted }}
          onStartFullscreen={() => void gate.start()}
          pending={counts}
          outletName={outletName}
          fullName={fullName}
          targets={targets}
        />
      </div>
    </DensityRoot>
  );
}
