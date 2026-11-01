"use client";

import { useCallback, useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/time";
import { useSse } from "@/shell/useSse";
import { enqueueTestPrintAction, listTodayQueueAction, reprintAction } from "@/modules/order/actions/printJobs";
import { listPrintersAction } from "@/modules/order/actions/printers";
import type { QueueJob } from "@/modules/order/server/printJobs";
import type { PrinterRow } from "@/modules/order/server/printers";

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

const BADGE_TONES: Record<QueueJob["status"], string> = {
  KUYRUKTA: "bg-slate-100 text-slate-700 border-slate-300",
  BASILIYOR: "bg-amber-100 text-amber-700 border-amber-300",
  BASILDI: "bg-emerald-100 text-emerald-700 border-emerald-300",
  HATA: "bg-red-100 text-red-700 border-red-300",
};

function StatusBadge({ status }: { status: QueueJob["status"] }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${BADGE_TONES[status]}`}>
      {status}
    </span>
  );
}

function PrinterChip({ printer }: { printer: PrinterRow }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
      <span className="font-medium">{printer.name}</span>
      {printer.online ? (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          çevrimiçi
        </span>
      ) : printer.lastSeenAt !== null ? (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
          {printer.lastStatus ?? "HATA"}
        </span>
      ) : (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">görülmedi</span>
      )}
      <span className="text-xs text-slate-500">
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
          <h1 className="text-lg font-bold">Fiş Yazıcı Kuyruğu</h1>
          <p className="text-sm text-slate-500">Bugünün işleri</p>
        </div>
        {canTestPrint ? <div className="flex items-center gap-2">
          <select
            aria-label="Yazıcı"
            value={testPrinterId}
            onChange={(event) => setTestPrinterId(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
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
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Test fişi
          </button>
        </div> : null}
      </header>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className={notice.tone === "ok" ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
          {notice.text}
        </p>
      ) : null}

      <section aria-label="Yazıcı durumu" className="flex flex-wrap gap-2">
        {printers.length === 0 ? (
          <p className="text-sm text-slate-500">Bu otelde kayıtlı yazıcı yok.</p>
        ) : (
          printers.map((printer) => <PrinterChip key={printer.id} printer={printer} />)
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
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
              <th scope="col" className="px-3 py-2">
                Deneme
              </th>
              <th scope="col" className="px-3 py-2">
                Hata
              </th>
              {canReprint ? <th scope="col" className="px-3 py-2"><span className="sr-only">İşlemler</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-3 py-2">{formatInTimeZone(job.createdAt, TZ, "HH:mm")}</td>
                <td className="px-3 py-2 font-medium">{jobLabel(job)}</td>
                <td className="px-3 py-2">{jobTable(job)}</td>
                <td className="px-3 py-2">{job.printer?.name}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-3 py-2">{job.attempts}</td>
                <td className="max-w-64 truncate px-3 py-2" title={job.error ?? undefined}>
                  {job.error ?? ""}
                </td>
                {canReprint ? <td className="px-3 py-2 text-right">
                  {canReprintJob(job) ? (
                    <button
                      type="button"
                      onClick={() => void reprint(job)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50"
                    >
                      Yeniden bas
                    </button>
                  ) : null}
                </td> : null}
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={canReprint ? 8 : 7} className="px-3 py-6 text-center text-slate-500">
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
