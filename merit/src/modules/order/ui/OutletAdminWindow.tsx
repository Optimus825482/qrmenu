"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import type { AppProps } from "@/shell/registry";
import { ReasonDialog } from "@/components/ui/ReasonDialog";
import { TZ } from "@/lib/time";
import { useSse } from "@/shell/useSse";
import {
  advanceAdminOrderAction,
  cancelAdminCallAction,
  cancelAdminOrderAction,
  listAdminCallsAction,
  listAdminOrdersAction,
  outletAdminCapabilitiesAction,
  resolveAdminCallAction,
} from "../actions/outletAdmin";
import type { AdminCallRow, AdminCapabilities, AdminOrderRow } from "../server/outletAdmin";
import { ORDER_CANCEL_REASONS, REASON_MIN_LENGTH } from "./reasons";

type Tab = "orders" | "calls";
type Badge = { label: string; color: string; bg: string };

const ORDER_BADGE: Record<string, Badge> = {
  GONDERILDI: { label: "Onay bekliyor", color: "#1d4ed8", bg: "#dbeafe" },
  ONAYLANDI: { label: "Hazırlanıyor", color: "#047857", bg: "#d1fae5" },
  HAZIR: { label: "Hazır", color: "#92400e", bg: "#fef3c7" },
  SERVIS_EDILDI: { label: "Servis edildi", color: "#374151", bg: "#e5e7eb" },
  REDDEDILDI: { label: "Reddedildi", color: "#991b1b", bg: "#fecaca" },
  IPTAL: { label: "İptal", color: "#b91c1c", bg: "#fee2e2" },
};
const CALL_BADGE: Record<string, Badge> = {
  ACIK: { label: "Açık", color: "#b45309", bg: "#fef3c7" },
  YANITLANDI: { label: "Yanıtlandı", color: "#1d4ed8", bg: "#dbeafe" },
  KAPANDI: { label: "Kapandı", color: "#374151", bg: "#e5e7eb" },
  IPTAL: { label: "İptal", color: "#b91c1c", bg: "#fee2e2" },
};
const NEXT_LABEL: Record<string, string> = { ONAYLANDI: "Onayla", HAZIR: "Hazır yap", SERVIS_EDILDI: "Servis edildi yap" };
const CALL_TYPE: Record<string, string> = { GARSON: "Garson", HESAP: "Hesap", DIGER: "Diğer" };
const CALL_CANCEL_REASONS = ["Yanlışlıkla basılmış", "Masa boş / misafir ayrıldı", "Mükerrer çağrı", "Deneme çağrısı"] as const;

const ORDER_FILTERS: [string, string][] = [
  ["ACIK", "Açık siparişler"],
  ["HEPSI", "Tüm durumlar"],
  ["GONDERILDI", "Onay bekleyen"],
  ["ONAYLANDI", "Hazırlanan"],
  ["HAZIR", "Hazır"],
  ["SERVIS_EDILDI", "Servis edilen"],
  ["REDDEDILDI", "Reddedilen"],
  ["IPTAL", "İptal edilen"],
];
const CALL_FILTERS: [string, string][] = [
  ["ACIK_TUM", "Açık çağrılar"],
  ["HEPSI", "Tüm durumlar"],
  ["ACIK", "Yanıt bekleyen"],
  ["YANITLANDI", "Yanıtlanan"],
  ["KAPANDI", "Kapanan"],
  ["IPTAL", "İptal edilen"],
];

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const RELOAD_DEBOUNCE_MS = 400;
const LIVE_TYPES = [
  "order.created",
  "order.approved",
  "order.rejected",
  "order.prep",
  "order.ready",
  "order.served",
  "order.cancelled",
  "call.created",
  "call.resolved",
  "table.cleared",
  "realtime.resync",
] as const;

const fmt = (iso: string | null, pattern = "dd.MM HH:mm") => (iso ? formatInTimeZone(new Date(iso), TZ, pattern) : "—");
const wait = (sec: number) => (sec < 60 ? `${sec} sn` : sec < 3600 ? `${Math.floor(sec / 60)} dk` : `${Math.floor(sec / 3600)} sa ${Math.floor((sec % 3600) / 60)} dk`);

const btn =
  "min-h-[32px] rounded border border-[#7f9db9] bg-gradient-to-b from-white to-[#ece9d8] px-2.5 py-1 font-medium hover:to-[#e0ded0] disabled:opacity-50";
const dangerBtn = "min-h-[32px] rounded border border-red-400 bg-red-50 px-2.5 py-1 font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50";
const field = "min-h-[32px] rounded border border-[#7f9db9] bg-white px-2 py-1";

function Pill({ badge }: { badge: Badge }) {
  return (
    <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: badge.bg, color: badge.color }}>
      {badge.label}
    </span>
  );
}

/**
 * Sipariş ve Çağrı Yönetimi (QS-YON): table orders and guest calls of every outlet of the selected hotel.
 * One component for the desktop window and the mobile/tablet shell: the tables turn into stacked cards on a
 * narrow screen. Rules and permissions are the server's (server/outletAdmin); the buttons only follow them.
 */
export function OutletAdminWindow({ hotelId, setStatus }: AppProps) {
  const [tab, setTab] = useState<Tab>("orders");
  const [caps, setCaps] = useState<AdminCapabilities | null>(null);
  const [outletId, setOutletId] = useState("");
  const [orderStatus, setOrderStatus] = useState("ACIK");
  const [callStatus, setCallStatus] = useState("ACIK_TUM");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [calls, setCalls] = useState<AdminCallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<{ kind: Tab; id: string; label: string } | null>(null);
  /** Counts requests so a slow, older response never overwrites a newer one. */
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!hotelId) return;
    let alive = true;
    void outletAdminCapabilitiesAction(hotelId).then((res) => {
      if (!alive) return;
      if (res.ok) setCaps(res.data);
      else setError(res.error.message);
    });
    return () => {
      alive = false;
    };
  }, [hotelId]);

  const load = useCallback(async () => {
    if (!hotelId) return;
    const id = ++requestId.current;
    setLoading(true);
    const query = {
      hotelId,
      outletId: outletId || undefined,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page,
      pageSize: PAGE_SIZE,
    };
    try {
      if (tab === "orders") {
        const res = await listAdminOrdersAction({ ...query, status: orderStatus });
        if (id !== requestId.current) return;
        if (!res.ok) return setError(res.error.message);
        setOrders(res.data.rows);
        setTotal(res.data.total);
        setStatus(`${res.data.total} sipariş`);
      } else {
        const res = await listAdminCallsAction({ ...query, status: callStatus });
        if (id !== requestId.current) return;
        if (!res.ok) return setError(res.error.message);
        setCalls(res.data.rows);
        setTotal(res.data.total);
        setStatus(`${res.data.total} çağrı`);
      }
      setError(null);
    } catch {
      if (id === requestId.current) setError("Liste yüklenemedi, tekrar deneyin");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [hotelId, tab, outletId, search, dateFrom, dateTo, page, orderStatus, callStatus, setStatus]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Live: any order or call event of this hotel reloads the list shortly after (bursts collapse into one reload).
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useSse((e) => {
    if (e.type !== "realtime.resync" && hotelId !== undefined && e.hotelId !== undefined && e.hotelId !== hotelId) return;
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void loadRef.current(), RELOAD_DEBOUNCE_MS);
  }, LIVE_TYPES);
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  /** Runs one write, shows its error in the banner, and reloads the list either way (a conflict means it is stale). */
  const run = async (id: string, action: () => Promise<{ ok: true } | { ok: false; error: { message: string } }>) => {
    setBusyId(id);
    try {
      const res = await action();
      setError(res.ok ? null : res.error.message);
      await load();
      return res.ok;
    } catch {
      setError("İşlem tamamlanamadı, tekrar deneyin");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = async (why: string) => {
    if (!cancelling) return;
    const { kind, id } = cancelling;
    const ok = await run(id, () => (kind === "orders" ? cancelAdminOrderAction(id, why) : cancelAdminCallAction(id, why)));
    if (!ok) throw new Error("cancel failed"); // keeps the dialog open; the banner says why
    setCancelling(null);
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setOpenId(null);
    setTotal(0);
  };
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  if (!hotelId) return <p className="p-4 text-sm">Önce üst bardan bir otel seçin.</p>;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canEdit = caps?.canEdit ?? false;
  const canCancel = caps?.canCancel ?? false;
  const filters = tab === "orders" ? ORDER_FILTERS : CALL_FILTERS;
  const empty = loading ? "Yükleniyor..." : "Kayıt bulunamadı.";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f0f0f0] font-sans text-xs" data-testid="outlet-admin">
      <div role="tablist" aria-label="Liste" className="flex gap-1 border-b border-[#7f9db9] bg-[#ece9d8] px-2 pt-2">
        {(["orders", "calls"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            data-guide={t === "orders" ? "yon-siparis" : "yon-cagri"}
            aria-selected={tab === t}
            onClick={() => switchTab(t)}
            className={`min-h-[36px] rounded-t border border-b-0 border-[#7f9db9] px-4 py-1.5 text-[13px] font-semibold ${
              tab === t ? "bg-white text-[#0b1a2d]" : "bg-[#dedbcb] text-gray-700 hover:bg-[#e8e5d6]"
            }`}
          >
            {t === "orders" ? "Siparişler" : "Çağrılar"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#7f9db9] bg-[#ece9d8] p-2">
        <select aria-label="Outlet" value={outletId} onChange={(e) => resetPage(setOutletId)(e.target.value)} className={field}>
          <option value="">Tüm outletler</option>
          {caps?.outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Durum"
          value={tab === "orders" ? orderStatus : callStatus}
          onChange={(e) => resetPage(tab === "orders" ? setOrderStatus : setCallStatus)(e.target.value)}
          className={field}
        >
          {filters.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <span>Tarih</span>
          <input type="date" aria-label="Başlangıç tarihi" value={dateFrom} onChange={(e) => resetPage(setDateFrom)(e.target.value)} className={field} />
          <span>–</span>
          <input type="date" aria-label="Bitiş tarihi" value={dateTo} onChange={(e) => resetPage(setDateTo)(e.target.value)} className={field} />
        </label>
        <input
          type="search"
          aria-label={tab === "orders" ? "Masa ya da sipariş no ara" : "Masa ara"}
          placeholder={tab === "orders" ? "Masa ya da sipariş no" : "Masa"}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={`${field} w-44`}
        />
        <button type="button" onClick={() => void load()} className={btn}>
          Yenile
        </button>
        <span className="ml-auto font-semibold text-gray-700">
          {total} {tab === "orders" ? "sipariş" : "çağrı"}
        </span>
      </div>

      {error ? (
        <p role="alert" className="border-b border-red-300 bg-red-50 px-2 py-1.5 font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div data-guide="yon-iptal" className="min-h-0 flex-1 overflow-auto bg-white">
        {tab === "orders" ? (
          <table className="w-full border-collapse text-left max-md:block">
            <thead className="sticky top-0 bg-[#f3f1e7] max-md:hidden">
              <tr className="border-b border-[#d4d0c8] text-[11px] uppercase tracking-wide text-gray-600">
                <th className="px-2 py-1.5">Sipariş</th>
                <th className="px-2 py-1.5">Outlet / Masa</th>
                <th className="px-2 py-1.5">Durum</th>
                <th className="px-2 py-1.5">İçerik</th>
                <th className="px-2 py-1.5">Saat</th>
                <th className="px-2 py-1.5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {orders.length === 0 ? (
                <tr className="max-md:block">
                  <td colSpan={6} className="p-6 text-center text-gray-600 max-md:block">
                    {empty}
                  </td>
                </tr>
              ) : null}
              {orders.map((o) => {
                const busy = busyId === o.id;
                const open = openId === o.id;
                return (
                  <tr key={o.id} className="border-b border-[#e5e2d6] align-top hover:bg-[#faf9f3] max-md:flex max-md:flex-col max-md:gap-1 max-md:p-2">
                    <td className="px-2 py-1.5 max-md:p-0">
                      <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : o.id)} className="font-mono font-bold text-[#0b3d91] underline-offset-2 hover:underline">
                        #{o.orderNo}
                      </button>
                    </td>
                    <td className="px-2 py-1.5 max-md:p-0">
                      <b>{o.outletName}</b> · {o.tableLabel}
                    </td>
                    <td className="px-2 py-1.5 max-md:p-0">
                      <Pill badge={ORDER_BADGE[o.status] ?? { label: o.status, color: "#374151", bg: "#f3f4f6" }} />
                      {o.reason ? <div className="mt-0.5 text-[11px] text-red-700">Neden: {o.reason}</div> : null}
                    </td>
                    <td className="px-2 py-1.5 max-md:p-0">
                      {open ? (
                        <div className="flex flex-col gap-0.5">
                          {o.items.map((i, idx) => (
                            <div key={idx}>
                              {i.qty}× {i.name}
                              {i.note ? <span className="text-amber-800"> — {i.note}</span> : null}
                              {i.noteOriginal ? <span className="text-gray-500"> (Orijinal: {i.noteOriginal})</span> : null}
                            </div>
                          ))}
                          {o.note ? (
                            <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-1 text-amber-900">
                              Not: {o.note}
                              {o.noteOriginal ? <span className="text-gray-600"> (Orijinal: {o.noteOriginal})</span> : null}
                            </div>
                          ) : null}
                          <div className="mt-1 text-[11px] text-gray-600">
                            Geldi {fmt(o.createdAt, "HH:mm")} · Onay {fmt(o.approvedAt, "HH:mm")} · Hazır {fmt(o.readyAt, "HH:mm")} · Servis {fmt(o.servedAt, "HH:mm")}
                            {o.closedAt ? ` · İptal ${fmt(o.closedAt, "HH:mm")}` : ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-700">
                          {o.itemCount} ürün{o.note ? " · notlu" : ""}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono max-md:p-0">{fmt(o.createdAt)}</td>
                    <td className="px-2 py-1.5 max-md:p-0">
                      <div className="flex flex-wrap justify-end gap-1 max-md:justify-start">
                        {o.next && canEdit ? (
                          <button type="button" disabled={busy} onClick={() => void run(o.id, () => advanceAdminOrderAction(o.id, o.status))} className={btn}>
                            {NEXT_LABEL[o.next] ?? "İlerlet"}
                          </button>
                        ) : null}
                        {o.cancellable && canCancel ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setCancelling({ kind: "orders", id: o.id, label: `#${o.orderNo} · ${o.outletName} ${o.tableLabel}` })}
                            className={dangerBtn}
                          >
                            İptal
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse text-left max-md:block">
            <thead className="sticky top-0 bg-[#f3f1e7] max-md:hidden">
              <tr className="border-b border-[#d4d0c8] text-[11px] uppercase tracking-wide text-gray-600">
                <th className="px-2 py-1.5">Outlet / Masa</th>
                <th className="px-2 py-1.5">Çağrı</th>
                <th className="px-2 py-1.5">Durum</th>
                <th className="px-2 py-1.5">Geldi</th>
                <th className="px-2 py-1.5">Bekleme</th>
                <th className="px-2 py-1.5">İşleyen</th>
                <th className="px-2 py-1.5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {calls.length === 0 ? (
                <tr className="max-md:block">
                  <td colSpan={7} className="p-6 text-center text-gray-600 max-md:block">
                    {empty}
                  </td>
                </tr>
              ) : null}
              {calls.map((c) => {
                const busy = busyId === c.id;
                const isOpen = c.status === "ACIK" || c.status === "YANITLANDI";
                return (
                  <tr key={c.id} className="border-b border-[#e5e2d6] align-top hover:bg-[#faf9f3] max-md:flex max-md:flex-col max-md:gap-1 max-md:p-2">
                    <td className="px-2 py-1.5 max-md:p-0">
                      <b>{c.outletName}</b> · {c.tableLabel}
                    </td>
                    <td className="px-2 py-1.5 max-md:p-0">
                      {CALL_TYPE[c.type] ?? c.type}
                      {c.note ? <span className="text-gray-700"> — {c.note}</span> : null}
                    </td>
                    <td className="px-2 py-1.5 max-md:p-0">
                      <Pill badge={CALL_BADGE[c.status] ?? { label: c.status, color: "#374151", bg: "#f3f4f6" }} />
                      {c.cancelNote ? <div className="mt-0.5 text-[11px] text-red-700">Neden: {c.cancelNote}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono max-md:p-0">{fmt(c.createdAt)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 max-md:p-0">{wait(c.waitSec)}</td>
                    <td className="px-2 py-1.5 max-md:p-0">{c.resolvedBy ?? "—"}</td>
                    <td className="px-2 py-1.5 max-md:p-0">
                      <div className="flex flex-wrap justify-end gap-1 max-md:justify-start">
                        {c.status === "ACIK" && canEdit ? (
                          <button type="button" disabled={busy} onClick={() => void run(c.id, () => resolveAdminCallAction(c.id, "YANITLANDI"))} className={btn}>
                            Yanıtlandı
                          </button>
                        ) : null}
                        {isOpen && canEdit ? (
                          <button type="button" disabled={busy} onClick={() => void run(c.id, () => resolveAdminCallAction(c.id, "KAPANDI"))} className={btn}>
                            Kapat
                          </button>
                        ) : null}
                        {isOpen && canCancel ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setCancelling({ kind: "calls", id: c.id, label: `${c.outletName} ${c.tableLabel} · ${CALL_TYPE[c.type] ?? c.type}` })}
                            className={dangerBtn}
                          >
                            İptal
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-2 border-t border-[#d4d0c8] bg-[#f9fafb] p-1.5">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className={btn}>
            Önceki
          </button>
          <span>
            Sayfa {page} / {pages}
          </span>
          <button type="button" disabled={page >= pages || loading} onClick={() => setPage(page + 1)} className={btn}>
            Sonraki
          </button>
        </div>
      ) : null}

      <ReasonDialog
        open={cancelling !== null}
        title={cancelling?.kind === "calls" ? "Çağrıyı iptal et" : "Siparişi iptal et"}
        message={cancelling ? `${cancelling.label} iptal edilecek. İptal geri alınamaz; açıklama denetim kaydına yazılır.` : undefined}
        reasons={cancelling?.kind === "calls" ? CALL_CANCEL_REASONS : ORDER_CANCEL_REASONS}
        minLength={REASON_MIN_LENGTH}
        confirmLabel="İptal et"
        danger
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}
