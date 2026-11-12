"use client";

import { useCallback, useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/time";
import { useSse } from "@/shell/useSse";
import { enqueueTestPrintAction, listTodayQueueAction, reprintAction } from "@/modules/order/actions/printJobs";
import { listPrintersAction } from "@/modules/order/actions/printers";
import type { QueueJob } from "@/modules/order/server/printJobs";
import type { PrinterRow } from "@/modules/order/server/printers";
import { TONES, type StatusTone } from "@/components/ui/statusTone";

// Queue movements and heartbeat flips redraw the page; `realtime.resync` covers dropped events.
const LIVE_EVENTS = [
  "print.queued",
  "print.printed",
  "print.failed",
  "printer.status",
  "realtime.resync",
] as const;

type Notice = { tone: "ok" | "error"; text: string } | null;

const jobLabel = (job: QueueJob): string => job.kind === "TEST" ? "Test fişi" : job.kind === "MUTFAK" ? `Mutfak fişi · #${job.order?.orderNo ?? "—"}` : job.order ? `#${job.order.orderNo}` : "Fiş";

const jobTable = (job: QueueJob): string => job.order?.table?.label ?? "-";

const canReprintJob = (job: QueueJob): boolean =>
  job.kind === "FIS" && job.orderId !== null && (job.status === "BASILDI" || job.status === "HATA");

const BADGE_TONES: Record<QueueJob["status"], StatusTone> = {
  KUYRUKTA: "neutral",
  BASILIYOR: "pending",
  BASILDI: "ready",
  HATA: "call",
};

function StatusBadge({ status }: { status: QueueJob["status"] }) {
  const t = TONES[BADGE_TONES[status]];
  return (
    <span className="inline-block rounded-full px-2 text-sm font-semibold" style={{ color: t.fg, background: t.bg, border: `2px ${t.border === "dashed" ? "dashed" : t.border === "double" ? "double" : "solid"} ${t.fg}` }}>
      {status}
    </span>
  );
}

function PrinterChip({ printer }: { printer: PrinterRow }) {
  const state = printer.online ? "ok" : printer.lastSeenAt !== null ? "bad" : "unseen";
  return (
    <span className="inline-flex items-center gap-2 rounded-[var(--radius-m)] border border-border bg-surface px-3 py-2 text-sm">
      <span className="font-medium">{printer.name}</span>
      <span className="rounded-full px-2 text-sm font-semibold" style={state === "ok" ? { color: "var(--success)", background: "var(--success-bg)" } : state === "bad" ? { color: "var(--danger)", background: "var(--danger-bg)" } : { color: "var(--muted)", background: "var(--muted-bg)" }}>
        {state === "ok" ? "çevrimiçi" : state === "bad" ? (printer.lastStatus ?? "HATA") : "görülmedi"}
      </span>
      <span className="text-sm text-muted">
        kuyruk {printer.queued} · hata {printer.failed}
      </span>
    </span>
  );
}

/**
 * Kasa yazıcı kuyruğu: today's print jobs of the hotel with reprints and test receipts, live over
 * SSE. The page sits outside the XP shell, so feedback stays inline (no shell dialogs).
 */
export function YaziciKuyrugu({
  hotelId,
  canTestPrint,
  canReprint,
}: {
  hotelId: string;
  canTestPrint: boolean;
  canReprint: boolean;
}) {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [testPrinterId, setTestPrinterId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    const [queue, list] = await Promise.all([listTodayQueueAction(), listPrintersAction({ hotelId })]);
    if (!queue.ok) {
      setError(queue.error.message);
      return;
    }
    setError(null);
    setJobs(queue.data);
    if (list.ok) {
      setPrinters(list.data.items);
      setTestPrinterId((current) => {
        const active = list.data.items.filter((printer) => printer.isActive);
        const pool = active.length > 0 ? active : list.data.items;
        return current && pool.some((printer) => printer.id === current)
          ? current
          : (pool[0]?.id ?? "");
      });
    }
  }, [hotelId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useSse(() => void load(), LIVE_EVENTS);

  const sendTest = async () => {
    if (!testPrinterId) return;
    const result = await enqueueTestPrintAction({ printerId: testPrinterId });
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error.message });
      return;
    }
    setNotice({ tone: "ok", text: "Test fişi kuyruğa alındı" });
    await load();
  };

  const reprint = async (job: QueueJob) => {
    if (!job.orderId) return;
    const result = await reprintAction({ orderId: job.orderId });
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error.message });
      return;
    }
    setNotice({ tone: "ok", text: `${jobLabel(job)} kuyruğa alındı` });
    await load();
  };

  const testPrinters = printers.filter((printer) => printer.isActive);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Fiş Yazıcı Kuyruğu</h1>
          <p className="text-sm text-muted">Bugünün işleri</p>
        </div>
        {canTestPrint ? <div className="flex flex-wrap items-center" style={{ gap: "var(--tap-gap)" }}>
          <select
            aria-label="Yazıcı"
            value={testPrinterId}
            onChange={(event) => setTestPrinterId(event.target.value)}
            className="min-h-11 min-w-0 rounded-xl border border-border bg-bg px-3 text-base text-text" style={{ minHeight: "var(--tap-action)" }}
          >
            {testPrinters.length === 0 ? <option value="">Yazıcı yok</option> : null}
            {testPrinters.map((printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={!testPrinterId}
            className="pos-btn" data-primary data-guide="test-fisi"
          >
            Test fişi
          </button>
        </div> : null}
      </header>

      {error ? (
        <p role="alert" className="rounded-[var(--radius-m)] border px-3 py-2 text-sm" style={{ color: "var(--danger)", background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm font-semibold" style={{ color: notice.tone === "ok" ? "var(--success)" : "var(--danger)" }}>
          {notice.text}
        </p>
      ) : null}

      <section data-guide="yazici-listesi" aria-label="Yazıcı durumu" className="flex flex-wrap gap-2">
        {printers.length === 0 ? (
          <p className="text-sm text-muted">Bu otelde kayıtlı yazıcı yok.</p>
        ) : (
          printers.map((printer) => <PrinterChip key={printer.id} printer={printer} />)
        )}
      </section>

      <section data-guide="bekleyen-fisler" role="region" aria-label="Yazıcı işleri" tabIndex={0} className="relative overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b-2 border-border bg-bg text-left text-sm text-muted">
              <th scope="col" className="px-3 py-2">
                Saat
              </th>
              <th scope="col" className="px-3 py-2">
                Fiş
              </th>
              <th scope="col" className="px-3 py-2">
                Masa
              </th>
              <th scope="col" className="px-3 py-2">
                Yazıcı
              </th>
              <th scope="col" className="px-3 py-2">
                Durum
              </th>
              <th scope="col" className="px-3 py-2 text-center">
                Deneme
              </th>
              <th scope="col" className="px-3 py-2">
                Hata
              </th>
              {canReprint ? <th scope="col" className="px-3 py-2"><span className="sr-only">İşlemler</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, index) => (
              <tr key={job.id} className={`border-b border-border last:border-0 hover:bg-accent/10 ${index % 2 === 0 ? "bg-surface" : "bg-bg"}`}>
                <td className="whitespace-nowrap px-3 py-2">{formatInTimeZone(job.createdAt, TZ, "HH:mm")}</td>
                <td className="px-3 py-2 font-medium">{jobLabel(job)}</td>
                <td className="px-3 py-2">{jobTable(job)}</td>
                <td className="px-3 py-2">{job.printer?.name}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{job.attempts}</td>
                <td className="max-w-64 truncate px-3 py-2">
                  {job.error ?? ""}
                </td>
                {canReprint ? <td className="px-3 py-2 text-right">
                  {canReprintJob(job) ? (
                    <button
                      type="button"
                      onClick={() => void reprint(job)}
                      className="pos-btn"
                    >
                      Yeniden bas
                    </button>
                  ) : null}
                </td> : null}
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={canReprint ? 8 : 7} className="px-3 py-6 text-center text-muted">
                  Bugün basılacak iş yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
