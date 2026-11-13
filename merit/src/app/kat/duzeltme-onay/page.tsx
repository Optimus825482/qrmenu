"use client";

import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { BackLink } from "@/components/staff/BackLink";
import { ScreenLink } from "@/components/staff/StaffScreens";
import { screenTitle } from "@/components/staff/screenTitle";
import { askReason } from "@/components/ui/reason";
import type { CorrectionRequestItem } from "@/modules/minibar/server/minibarTypes";
import { StockCorrectionRequests } from "@/modules/minibar/ui/StockCorrectionRequests";
import { notify } from "@/shell/notify";

type ManualRow = {
  id: string;
  roomNumber: string;
  floorName: string;
  reason: string;
  status: string;
  requestedByName: string;
  createdAt: string;
  totalQty: number;
  items: { productName: string; qty: number }[];
};
type StockRow = {
  id: string;
  code: string;
  note: string | null;
  createdAt: string;
  requestedByName: string;
  items: { productName: string; requestedQty: number }[];
};

export default function KatDuzeltmeOnayPage() {
  const [requests, setRequests] = useState<CorrectionRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [manual, setManual] = useState<ManualRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const waitingCorrections = requests.filter((r) => r.status === "BEKLIYOR").length;
  const openLink =
    "inline-flex items-center rounded-xl border border-border bg-bg px-3 py-2 text-xs font-semibold text-text hover:bg-surface";
  // The warehouse decides ek talepler on its own screen; everybody else follows their own on the request screen.
  const stockHref = "/kat/talep";

  // The other approvals that wait for a manager. Each list is optional: a role without that screen simply
  // sees none of it.
  const loadOthers = useCallback(async () => {
    const read = async <T,>(url: string): Promise<T | null> => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        return res.ok ? ((await res.json()) as T) : null;
      } catch {
        return null;
      }
    };
    const [manualJson, stockJson] = await Promise.all([
      read<{ requests?: ManualRow[] }>("/api/minibar/manual-requests"),
      read<{ items?: StockRow[]; operator?: boolean }>("/api/minibar/stock-requests?status=BEKLEMEDE&pageSize=100"),
    ]);
    setManual((manualJson?.requests ?? []).filter((r) => r.status === "BEKLIYOR"));
    setStock(stockJson?.items ?? []);
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    void loadOthers();
    try {
      const res = await mbFetch("/api/minibar/corrections");
      // The route answers with the list itself; an error answer is an object.
      const json = (await res.json()) as CorrectionRequestItem[] | { requests?: CorrectionRequestItem[]; error?: string };
      if (!res.ok) throw new Error((Array.isArray(json) ? undefined : json.error) ?? "Talepler alınamadı.");
      setRequests(Array.isArray(json) ? json : (json.requests ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, [loadOthers]);

  useEffect(() => {
    const t = setTimeout(() => void loadRequests(), 0);
    return () => clearTimeout(t);
  }, [loadRequests]);

  const handleResolve = async (id: string, approved: boolean) => {
    let rejectReason: string | undefined;
    if (!approved) {
      const reason = await askReason({
        title: "Düzeltme talebini reddet",
        reasons: ["Gerekçe yetersiz", "Stok sayımıyla uyuşmuyor", "Hatalı oda kaydı"],
        minLength: 3,
        confirmLabel: "Reddet",
        danger: true,
      });
      if (!reason) return;
      rejectReason = reason;
    }

    setProcessingId(id);
    try {
      const res = await mbFetch(`/api/minibar/corrections/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, rejectReason }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "İşlem başarısız.");
      await loadRequests();
      notify.success(json.message ?? (approved ? "Talep onaylandı." : "Talep reddedildi."));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Hata");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text">

      <header className="sticky top-[var(--staff-head-h,0px)] z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Root of the depot menu, a sub-page of İşlemlerim on the floor menu; the first screen of a shell
                window (Onaylar app) shows none: the shell's own arrow leaves it (BackLink). */}
            <BackLink />
            <div className="min-w-0">
              <h1 className="text-lg font-bold">{screenTitle("MB-TAL")}</h1>
              <p className="text-xs text-muted">
                Düzeltme ve silme talepleri, manuel kayıt talepleri ve ek stok talepleri — toplam {waitingCorrections + manual.length + stock.length} bekleyen
              </p>
            </div>
          </div>
          <Link
            href="/kat/talep"
            data-guide="yeni-talep"
            style={{ minHeight: "var(--tap-action)" }}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-text hover:bg-bg"
          >
            Yeni ek talep
          </Link>
        </div>
      </header>

      <main data-guide="talep-listesi" className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        {/* Otel deposu sayım düzeltmeleri: yalnız sistem yöneticisi ve minibar sistem sorumlusu görür. */}
        <StockCorrectionRequests />

        <section data-testid="bekleyen-manuel" className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-text">Manuel kayıt talepleri ({manual.length} bekleyen)</h2>
            <ScreenLink href="/kat/manuel-kayit" style={{ minHeight: "var(--tap-action)" }} className={openLink}>
              Manuel kayıt taleplerini aç
            </ScreenLink>
          </div>
          {manual.length === 0 ? (
            <p className="text-xs text-muted">Onay bekleyen manuel kayıt talebi yok.</p>
          ) : (
            <ul className="space-y-2">
              {manual.map((m) => (
                <li key={m.id} className="rounded-xl border border-border bg-bg p-3 text-xs text-text">
                  <p className="text-sm font-bold">
                    Oda {m.roomNumber} <span className="font-normal text-muted">· {m.floorName}</span>
                  </p>
                  <p className="text-muted">
                    Talep Eden: {m.requestedByName} · {new Date(m.createdAt).toLocaleString("tr-TR")}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold">Tüketim ({m.totalQty} adet):</span> {m.items.map((i) => `${i.productName} x${i.qty}`).join(", ")}
                  </p>
                  <p className="mt-1 text-muted">Açıklama: {m.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-testid="bekleyen-ek-talep" className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-text">Ek stok talepleri ({stock.length} bekleyen)</h2>
            <Link href={stockHref} style={{ minHeight: "var(--tap-action)" }} className={openLink}>
              Ek talepleri aç
            </Link>
          </div>
          {stock.length === 0 ? (
            <p className="text-xs text-muted">Onay bekleyen ek stok talebi yok.</p>
          ) : (
            <ul className="space-y-2">
              {stock.map((s) => (
                <li key={s.id} className="rounded-xl border border-border bg-bg p-3 text-xs text-text">
                  <p className="text-sm font-bold">{s.code}</p>
                  <p className="text-muted">
                    Talep Eden: {s.requestedByName} · {new Date(s.createdAt).toLocaleString("tr-TR")}
                  </p>
                  <p className="mt-1">{s.items.map((i) => `${i.productName} x${i.requestedQty}`).join(", ")}</p>
                  {s.note ? <p className="mt-1 text-muted">Not: {s.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <h2 className="px-1 text-sm font-bold text-text">Düzeltme ve silme talepleri ({waitingCorrections} bekleyen)</h2>
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Onay talepleri yükleniyor...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            {error}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Bekleyen veya geçmiş düzeltme talebi yok.
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="rounded-2xl border border-border bg-surface p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-text">Oda {req.roomNumber}</span>
                      <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-bold text-warn">
                        {req.actionType}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          req.status === "BEKLIYOR"
                            ? "bg-accent/15 text-accent"
                            : req.status === "ONAYLANDI"
                              ? "bg-ok/15 text-ok"
                              : "bg-danger/15 text-danger"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      Talep Eden: {req.requestedByName} ·{" "}
                      {new Date(req.createdAt).toLocaleString("tr-TR")}
                    </p>
                  </div>

                  {req.status === "BEKLIYOR" ? (
                    <div data-guide={req.id === requests.find((r) => r.status === "BEKLIYOR")?.id ? "onay-reddet" : undefined} className="flex items-center gap-2">
                      <button
                        type="button"
                        data-mutates=""
                        onClick={() => void handleResolve(req.id, true)}
                        disabled={processingId === req.id}
                        style={{ minHeight: "var(--tap-action)" }}
                        className="inline-flex items-center gap-1 rounded-xl bg-ok px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50"
                      >
                        <Icon name="check" size={14} />
                        Onayla ve Uygula
                      </button>
                      <button
                        type="button"
                        data-mutates=""
                        onClick={() => void handleResolve(req.id, false)}
                        disabled={processingId === req.id}
                        style={{ minHeight: "var(--tap-action)" }}
                        className="inline-flex items-center gap-1 rounded-xl border border-danger/50 bg-danger/10 px-3.5 py-1.5 text-xs font-bold text-danger hover:bg-danger/20 disabled:opacity-50"
                      >
                        <Icon name="close" size={14} />
                        Reddet
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-border bg-bg p-3 text-xs text-text">
                  <span className="font-semibold text-muted">Gerekçe: </span>
                  {req.reason}
                </div>

                {req.approvedByName ? (
                  <p className="text-xs text-muted">
                    Karar Veren: {req.approvedByName} (
                    {req.resolvedAt ? new Date(req.resolvedAt).toLocaleString("tr-TR") : ""})
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
