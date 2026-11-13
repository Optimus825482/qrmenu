"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppProps } from "@/shell/registry";
import { formatPrice } from "@/lib/formatPrice";
import { businessDate, businessDay, formatDayTr } from "@/lib/time";
import { listRoomServiceOrdersAction, type RoomOrderListItem } from "../server/actions/roomServiceRecords";
import { getSlaStatsAction, getSlowestOrdersAction } from "../server/actions/roomServiceStats";
import type { SlaStats, SlowOrder } from "../server/roomService/stats";

const DAY_MS = 86_400_000;
const WEEK = "week";

/** `day` ('yyyy-MM-dd') moved by `offset` calendar days; pure date arithmetic, so DST never skips a day. */
function shiftDay(day: string, offset: number): string {
  return new Date(businessDay(day).getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

/** Last 7 business days (Nicosia) ending at `today`, newest first. */
function lastSevenDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDay(today, -i));
}

/** Seconds as "12 dk 05 sn" (or "45 sn"); "—" when there is nothing to show. */
function fmtDuration(sec: number | undefined): string {
  if (sec === undefined) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m === 0 ? `${s} sn` : `${m} dk ${String(s).padStart(2, "0")} sn`;
}

/** Orders fetched per request when the CSV collects every row of the range. */
const EXPORT_PAGE = 100;
/** Upper bound of exported rows; beyond it the export says it is partial. */
const EXPORT_MAX = 5000;

function Card({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      <span className={`mt-1 block text-2xl font-bold ${tone ?? "text-text"}`}>{value}</span>
      {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
    </div>
  );
}

export function RoomServiceReportsWindow({ hotelId, setStatus }: AppProps) {
  const [today, setToday] = useState(() => businessDate());
  const days = useMemo(() => lastSevenDays(today), [today]);
  const [pick, setPick] = useState<string>(today);
  const [stats, setStats] = useState<SlaStats | null>(null);
  const [slowest, setSlowest] = useState<SlowOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [revenue, setRevenue] = useState<{ amount: number; currency: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => (pick === WEEK ? { from: days[6], to: days[0] } : { from: pick, to: pick }),
    [pick, days],
  );

  // The business day rolls over at Nicosia midnight: keep the day list current while the window stays open.
  useEffect(() => {
    const t = setInterval(() => setToday(businessDate()), 60_000);
    return () => clearInterval(t);
  }, []);

  const loadData = useCallback(async () => {
    if (!hotelId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, w, list] = await Promise.all([
        getSlaStatsAction(hotelId, range),
        getSlowestOrdersAction(hotelId, range),
        listRoomServiceOrdersAction({
          hotelId,
          dateFrom: range.from,
          dateTo: range.to,
          pageSize: 1, // only the totals are needed here; the CSV pages through the rows itself
        }),
      ]);
      if (!s.ok) {
        setError(s.error.message);
        setStats(null);
        return;
      }
      setStats(s.data);
      setSlowest(w.ok ? w.data : []);
      setOrderTotal(list.ok ? list.data.total : 0);
      setRevenue(list.ok ? { amount: list.data.stats.totalRevenue, currency: list.data.stats.currency } : null);
      setStatus("Oda servisi SLA raporu güncellendi");
    } finally {
      setLoading(false);
    }
  }, [hotelId, range, setStatus]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  /** Report rows as a semicolon CSV (Excel opens it as is); quotes are doubled, formulas are neutralised. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: RoomOrderListItem[] = [];
      let total = 0;
      for (let page = 1; rows.length < EXPORT_MAX; page += 1) {
        const res = await listRoomServiceOrdersAction({
          hotelId,
          dateFrom: range.from,
          dateTo: range.to,
          page,
          pageSize: EXPORT_PAGE,
        });
        if (!res.ok) {
          setStatus(`CSV hazırlanamadı: ${res.error.message}`);
          return;
        }
        total = res.data.total;
        rows.push(...res.data.orders);
        if (res.data.orders.length < EXPORT_PAGE || rows.length >= total) break;
      }
      const exported = rows.slice(0, EXPORT_MAX);

      const cell = (value: string | number | null | undefined): string => {
        const text = value === null || value === undefined ? "" : String(value);
        const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const header = ["Sipariş No", "Otel", "Oda", "Durum", "Tutar", "Para birimi", "Oluşturma", "Teslim", "SLA uyarısı"];
      const lines = exported.map((o) =>
        [o.orderNo, o.hotelName, o.roomNumber, o.status, o.subtotal, o.currency, o.createdAt, o.deliveredAt, o.slaBreachedAt]
          .map(cell)
          .join(";"),
      );
      const csv = [header.map(cell).join(";"), ...lines].join("\r\n");
      const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `oda-servisi-sla-${range.from}${range.to === range.from ? "" : `_${range.to}`}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatus(
        exported.length < total
          ? `Yalnızca ilk ${exported.length} satır indirildi (toplam ${total} kayıt)`
          : `${exported.length} satır indirildi`,
      );
    } finally {
      setExporting(false);
    }
  };

  const show = (v: string) => (loading ? "..." : v);
  const hourMax = Math.max(1, ...(stats?.byHour.map((h) => h.count) ?? [0]));
  const byHour = new Map(stats?.byHour.map((h) => [h.hour, h]) ?? []);
  const slaLabel = stats ? `${stats.slaMinutes} dk hedef` : undefined;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-bg p-4 text-xs text-text">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
        <div>
          <h2 className="text-base font-bold">Oda Servisi SLA</h2>
          <p className="text-[11px] text-muted">Teslim süreleri, hedef uyumu ve iş günü bazında oda servisi performansı</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="text-muted">İş günü</span>
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="min-h-8 rounded border border-border bg-bg px-2 py-1 text-text"
            >
              <option value={WEEK}>Son 7 gün</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatDayTr(d)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadData()}
            data-xp-command="refresh"
            className="rounded border border-border bg-surface px-3 py-1 font-bold hover:bg-bg"
          >
            Yenile
          </button>
          <button
            type="button"
            data-guide="sla-indir"
            data-xp-command="export"
            disabled={loading || exporting || orderTotal === 0}
            onClick={() => void exportCsv()}
            className="rounded border border-border bg-surface px-3 py-1 font-bold hover:bg-bg disabled:opacity-50"
          >
            CSV indir
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger p-3 font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-guide="sla-ozeti">
        <Card label="Toplam sipariş" value={show(String(stats?.total ?? 0))} hint={stats ? `${stats.open} açık, ${stats.cancelled} iptal` : undefined} />
        <Card
          label="Teslim edilen"
          value={show(String(stats?.delivered ?? 0))}
          hint={stats && stats.total > 0 ? `%${Math.round((stats.delivered / stats.total) * 100)} tamamlama` : "—"}
          tone="text-success"
        />
        <Card
          label="Hedefte teslim"
          value={show(stats?.onTimePct === undefined ? "—" : `%${stats.onTimePct}`)}
          hint={slaLabel}
          tone="text-accent"
        />
        <Card
          label="SLA uyarısı alan"
          value={show(String(stats?.breaches ?? 0))}
          hint="uyarı işaretli sipariş (iptal ve açık dahil)"
          tone={stats && stats.breaches > 0 ? "text-danger" : undefined}
        />
        <Card label="Ortalama teslim" value={show(fmtDuration(stats?.avgDeliverySec))} />
        <Card label="Teslim süresi P90" value={show(fmtDuration(stats?.p90DeliverySec))} hint="siparişlerin %90'ı bu sürede" />
        {revenue ? <Card label="Teslim edilen ciro" value={show(formatPrice(revenue.amount, revenue.currency))} hint="fiyatı gösterilen teslimler" /> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-guide="sla-detay">
        <div className="rounded-lg border border-border bg-surface p-3">
          <h3 className="mb-3 border-b border-border pb-1 text-xs font-bold">Saate göre sipariş sayısı</h3>
          {!stats || stats.total === 0 ? (
            <p className="py-6 text-center text-muted">Veri yok</p>
          ) : (
            <div className="flex h-36 items-end gap-0.5" role="img" aria-label="Saate göre sipariş sayısı">
              {Array.from({ length: 24 }, (_, hour) => {
                const h = byHour.get(hour);
                const count = h?.count ?? 0;
                return (
                  <div
                    key={hour}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
                    title={`${String(hour).padStart(2, "0")}:00 — ${count} sipariş${h?.avgSec !== undefined ? `, ort. ${fmtDuration(h.avgSec)}` : ""}`}
                  >
                    <span className="text-[9px] text-muted">{count || ""}</span>
                    <div className="w-full rounded-t bg-accent" style={{ height: `${(count / hourMax) * 100}%`, minHeight: count ? 2 : 0 }} />
                    <span className="text-[9px] text-muted">{hour % 3 === 0 ? hour : ""}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-3">
          <h3 className="mb-3 border-b border-border pb-1 text-xs font-bold">En yavaş 20 sipariş</h3>
          {slowest.length === 0 ? (
            <p className="py-6 text-center text-muted">Teslim edilen sipariş yok</p>
          ) : (
            <div role="region" aria-label="En yavaş siparişler" tabIndex={0} className="max-h-52 overflow-auto rounded-xl border border-border">
              <table className="w-full min-w-[300px] text-left text-[11px]">
                <thead className="sticky top-0 border-b-2 border-border bg-bg text-muted">
                  <tr>
                    <th className="p-1.5">Sipariş</th>
                    <th className="p-1.5">Oda</th>
                    <th className="p-1.5">Gün</th>
                    <th className="p-1.5 text-right">Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {slowest.map((o) => (
                    <tr key={o.orderId} className="odd:bg-surface even:bg-bg hover:bg-accent/10">
                      <td className="p-1.5 font-mono">#{o.orderNo}</td>
                      <td className="p-1.5">{o.roomNumber}</td>
                      <td className="p-1.5">{formatDayTr(o.businessDate)}</td>
                      <td className={`p-1.5 text-right font-semibold tabular-nums ${o.breached ? "text-danger" : "text-success"}`}>
                        {fmtDuration(o.sec)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
