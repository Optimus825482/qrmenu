"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Row = {
  id: string;
  hotelName: string;
  productName: string;
  systemQty: number;
  countedQty: number;
  delta: number;
  reason: string;
  status: "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI";
  requestedByName: string;
  createdAt: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolveNote: string | null;
};
type Data = { waiting: Row[]; resolved: Row[]; canResolve: boolean; canRequest: boolean };

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const when = (iso: string) => new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });

/**
 * Otel deposu sayım düzeltme talepleri: minibar sistem sorumlusu gönderdiklerini izler, sistem yöneticisi
 * onaylar ya da reddeder. Görme yetkisi olmayan hesapta (ve hiç talep yokken, `hideWhenEmpty`) hiçbir şey çizmez.
 */
export function StockCorrectionRequests({
  hotelId,
  refreshKey = 0,
  hideWhenEmpty = false,
  onResolved,
}: {
  /** Unset: every hotel the account may see. */
  hotelId?: string;
  /** Bump to reload (a request was just sent). */
  refreshKey?: number;
  hideWhenEmpty?: boolean;
  onResolved?: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    try {
      const url = `/api/minibar/depo/stock/corrections${hotelId ? `?hotelId=${encodeURIComponent(hotelId)}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      setData(res.ok ? ((await res.json()) as Data) : null);
    } catch {
      setData(null);
    }
  }, [hotelId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const resolve = async (id: string, approve: boolean, note?: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/minibar/depo/stock/corrections/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, ...(note ? { note } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "İşlem tamamlanamadı.");
      setRejectId(null);
      setRejectNote("");
      await load();
      onResolved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem tamamlanamadı.");
    } finally {
      setBusyId(null);
    }
  };

  if (!data) return null;
  if (hideWhenEmpty && data.waiting.length === 0 && data.resolved.length === 0) return null;

  return (
    <section data-testid="stok-duzeltme-talepleri" className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-bold text-text">Stok düzeltme talepleri ({data.waiting.length} bekleyen)</h2>
        <p className="text-xs text-muted">
          {data.canResolve
            ? "Minibar sistem sorumlusunun gönderdiği sayım düzeltmeleri. Onayladığınızda fark otel deposu stoğuna işlenir."
            : "Gönderdiğiniz sayım düzeltmeleri sistem yöneticisi onaylayınca stoğa işlenir."}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {data.waiting.length === 0 ? (
        <p className="text-xs text-muted">Onay bekleyen stok düzeltme talebi yok.</p>
      ) : (
        <ul className="space-y-2">
          {data.waiting.map((r) => (
            <li key={r.id} className="space-y-2 rounded-xl border border-border bg-bg p-3 text-sm text-text">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">
                    {r.productName} <span className="font-normal text-muted">· {r.hotelName}</span>
                  </p>
                  <p className="text-xs text-muted">
                    Talep eden: {r.requestedByName} · {when(r.createdAt)}
                  </p>
                </div>
                <span className={`rounded-lg border px-2 py-1 text-sm font-bold tabular-nums ${r.delta < 0 ? "border-danger text-danger" : "border-success text-success"}`}>
                  Fark {signed(r.delta)} adet
                </span>
              </div>
              <p className="text-xs">
                Sayılan <strong>{r.countedQty}</strong> adet · talep anında sistemde <strong>{r.systemQty}</strong> adet
              </p>
              <p className="text-xs">
                <span className="font-semibold">Açıklama:</span> {r.reason}
              </p>
              {data.canResolve ? (
                rejectId === r.id ? (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void resolve(r.id, false, rejectNote.trim());
                    }}
                  >
                    <label className="min-w-[12rem] flex-1 text-xs font-semibold">
                      Ret sebebi
                      <input
                        autoFocus
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        maxLength={200}
                        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-normal text-text"
                      />
                    </label>
                    <Button onClick={() => setRejectId(null)} disabled={busyId === r.id}>
                      Vazgeç
                    </Button>
                    <Button mutates variant="danger" type="submit" disabled={busyId === r.id || rejectNote.trim().length < 3}>
                      Reddet
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      mutates
                      disabled={busyId === r.id}
                      onClick={() => {
                        setRejectNote("");
                        setRejectId(r.id);
                      }}
                    >
                      Reddet
                    </Button>
                    <Button mutates variant="primary" disabled={busyId === r.id} onClick={() => void resolve(r.id, true)}>
                      {busyId === r.id ? "İşleniyor..." : "Onayla ve stoğa işle"}
                    </Button>
                  </div>
                )
              ) : (
                <p className="text-xs font-semibold text-muted">Sistem yöneticisinin onayı bekleniyor.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.resolved.length > 0 ? (
        <div>
          <Button onClick={() => setShowResolved((v) => !v)} aria-expanded={showResolved}>
            {showResolved ? "Sonuçlananları gizle" : `Son sonuçlananlar (${data.resolved.length})`}
          </Button>
          {showResolved ? (
            <ul className="mt-2 space-y-1">
              {data.resolved.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-bg p-3 text-xs text-text">
                  <span className={`font-bold ${r.status === "ONAYLANDI" ? "text-success" : "text-danger"}`}>
                    {r.status === "ONAYLANDI" ? "Onaylandı" : "Reddedildi"}
                  </span>{" "}
                  · {r.productName} · {r.hotelName} · fark {signed(r.delta)} adet · {r.requestedByName}
                  {r.resolvedAt ? ` · ${r.resolvedByName ?? ""} ${when(r.resolvedAt)}` : ""}
                  <br />
                  <span className="text-muted">
                    Açıklama: {r.reason}
                    {r.resolveNote ? ` · Not: ${r.resolveNote}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
