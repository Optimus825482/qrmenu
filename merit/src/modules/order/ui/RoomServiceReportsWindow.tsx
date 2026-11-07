"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppProps } from "@/shell/registry";
import { formatPrice } from "@/lib/formatPrice";
import { businessDate, businessDateStart, formatDayTr } from "@/lib/time";
import { listRoomServiceOrdersAction, type RoomOrderListItem, type RoomServiceStats } from "../server/actions/roomServiceRecords";
import { getSlaStatsAction, getSlowestOrdersAction } from "../server/actions/roomServiceStats";
import type { SlaStats, SlowOrder } from "../server/roomService/stats";

const DAY_MS = 86_400_000;
const WEEK = "week";

/** Last 7 business days (Nicosia), newest first. */
function lastSevenDays(now: number): string[] {
  return Array.from({ length: 7 }, (_, i) => businessDate(new Date(now - i * DAY_MS)));
}

/** Seconds as "12 dk 05 sn" (or "45 sn"); "—" when there is nothing to show. */
function fmtDuration(sec: number | undefined): string {
  if (sec === undefined) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m === 0 ? `${s} sn` : `${m} dk ${String(s).padStart(2, "0")} sn`;
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

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
  const [days] = useState(() => lastSevenDays(Date.now()));
  const [pick, setPick] = useState<string>(days[0]);
  const [stats, setStats] = useState<SlaStats | null>(null);
  const [slowest, setSlowest] = useState<SlowOrder[]>([]);
  const [orders, setOrders] = useState<RoomOrderListItem[]>([]);
  const [revenue, setRevenue] = useState<RoomServiceStats["totalRevenue"]>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => (pick === WEEK ? { from: days[6], to: days[0] } : { from: pick, to: pick }),
    [pick, days],
  );

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
          dateFrom: businessDateStart(range.from).toISOString(),
          dateTo: new Date(businessDateStart(nextDay(range.to)).getTime() - 1).toISOString(),
          limit: 200,
        }),
      ]);
      if (!s.ok) {
        setError(s.error.message);
        setStats(null);
        return;
      }
      setStats(s.data);
      setSlowest(w.ok ? w.data : []);
      setOrders(list.ok ? list.data.orders : []);
      setRevenue(list.ok ? list.data.stats.totalRevenue : 0);
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
  const exportCsv = () => {
    const cell = (value: string | number | null | undefined): string => {
      const text = value === null || value === undefined ? "" : String(value);
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const header = ["Sipariş No", "Otel", "Oda", "Durum", "Tutar", "Para birimi", "Oluşturma", "Teslim", "SLA aşımı"];
    const lines = orders.map((o) =>
      [o.orderNo, o.hotelName, o.roomNumber, o.status, o.subtotal, o.currency, o.createdAt, o.deliveredAt, o.slaBreachedAt]
        .map(cell)
        .join(";"),
    );
    const csv = [header.map(cell).join(";"), ...lines].join("\r\n");
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `oda-servisi-sla-${range.from}${range.to === range.from ? "" : `_${range.to}`}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus(`${orders.length} satır indirildi`);
  };

  const show = (v: string) => (loading ? "..." : v);
  const hourMax = Math.max(1, ...(stats?.byHour.map((h) => h.count) ?? [0]));
  const byHour = new Map(stats?.byHour.map((h) => [h.hour, h]) ?? []);
  const pricesShown = orders.some((o) => o.subtotal !== undefined);
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
              className="rounded border border-border bg-surface px-2 py-1"
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
            disabled={loading || orders.length === 0}
            onClick={exportCsv}
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
          label="SLA ihlali"
          value={show(String(stats?.breaches ?? 0))}
          hint="ihlal işaretli sipariş"
          tone={stats && stats.breaches > 0 ? "text-danger" : undefined}
        />
        <Card label="Ortalama teslim" value={show(fmtDuration(stats?.avgDeliverySec))} />
        <Card label="Teslim süresi P90" value={show(fmtDuration(stats?.p90DeliverySec))} hint="siparişlerin %90'ı bu sürede" />
        <Card label="Ortalama teyit" value={show(fmtDuration(stats?.avgConfirmSec))} hint="oluşma - telefon teyidi" />
        {pricesShown ? <Card label="Toplam tutar" value={show(formatPrice(revenue, orders[0]?.currency ?? "EUR"))} hint="fiyatı gösterilen siparişler" /> : null}
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
            <div className="max-h-52 overflow-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-muted">
                  <tr>
                    <th className="p-1">Sipariş</th>
                    <th className="p-1">Oda</th>
                    <th className="p-1">Gün</th>
                    <th className="p-1 text-right">Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {slowest.map((o) => (
                    <tr key={o.orderId} className="border-t border-border">
                      <td className="p-1 font-mono">#{o.orderNo}</td>
                      <td className="p-1">{o.roomNumber}</td>
                      <td className="p-1">{formatDayTr(o.businessDate)}</td>
                      <td className={`p-1 text-right font-semibold ${o.breached ? "text-danger" : "text-success"}`}>
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
