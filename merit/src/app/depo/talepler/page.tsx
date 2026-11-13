"use client";

import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import { BackLink } from "@/components/staff/BackLink";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type Item = {
  id: string;
  productName: string;
  requestedQty: number;
  approvedQty: number | null;
  deliveredQty: number | null;
  urgency: "NORMAL" | "ACIL";
  poolRemaining: number;
};
type Req = {
  id: string;
  code: string;
  status: string;
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  requestedByName: string;
  items: Item[];
};
type Data = { items: Req[]; kpis: { pending: number; approved: number; deliveredToday: number } };

const FIELD = "min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-text placeholder:text-muted";
const CARD = "rounded-[var(--radius-l)] border border-border bg-surface";

/** Approved but not yet delivered (partial deliveries add up). */
const openQty = (i: Item) => Math.max(0, (i.approvedQty ?? 0) - (i.deliveredQty ?? 0));
const partlyDelivered = (r: Req) => r.status === "ONAYLANDI" && r.items.some((i) => (i.deliveredQty ?? 0) > 0);

const TABS = [
  { key: "BEKLEMEDE", label: "Bekleyen", status: "BEKLEMEDE" },
  { key: "ONAYLANDI", label: "Onaylanan", status: "ONAYLANDI" },
  { key: "GECMIS", label: "Geçmiş", status: "TESLIM_EDILDI,REDDEDILDI,IPTAL" },
] as const;

export default function DepoTaleplerPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("BEKLEMEDE");
  const [data, setData] = useState<Data | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const status = TABS.find((t) => t.key === tab)!.status;
    const res = await mbFetch(`/api/minibar/stock-requests?status=${status}&pageSize=100`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? "Talepler yüklenemedi");
      return;
    }
    setData(json as Data);
    const next: Record<string, string> = {};
    for (const r of json.items as Req[]) {
      for (const i of r.items) {
        next[i.id] = String(r.status === "ONAYLANDI" ? openQty(i) : i.requestedQty);
      }
    }
    setQty(next);
  }, [tab]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function act(r: Req, action: "approve" | "reject" | "deliver" | "cancel") {
    const items = r.items.map((i) =>
      action === "approve"
        ? { itemId: i.id, approvedQty: Number(qty[i.id]) }
        : { itemId: i.id, deliveredQty: Number(qty[i.id]) },
    );
    const body =
      action === "approve" || action === "deliver" ? { items } : { reason: reason[r.id] ?? "" };
    const res = await mbFetch(`/api/minibar/stock-requests/${r.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMessage(res.ok ? "İşlem tamamlandı" : (json.error ?? "İşlem yapılamadı"));
    await load();
  }

  const kpis = data
    ? [
        { label: "Bekleyen", value: data.kpis.pending, box: "border-warn/30 bg-warn/10", head: "text-warn" },
        { label: "Onaylanan", value: data.kpis.approved, box: "border-border bg-surface", head: "text-muted" },
        { label: "Bugün teslim", value: data.kpis.deliveredToday, box: "border-success bg-[var(--success-bg)]", head: "text-success" },
      ]
    : [];

  return (
    <main data-testid="depo-talepler" className="flex flex-col gap-4 text-text">
      <div className="flex flex-wrap items-center gap-2">
        <BackLink />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Ek talepler</h1>
          <p className="text-sm text-muted">Kat sorumlularının otel deposundan istediği ek ürünler</p>
        </div>
      </div>

      {data && (
        <div data-testid="talep-kpi" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.box}`}>
              <p className={`text-sm uppercase tracking-wider ${k.head}`}>{k.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{k.value}</p>
            </div>
          ))}
        </div>
      )}
      {message && (
        <p role="status" data-testid="talepler-mesaj" className={`${CARD} p-4 text-sm`}>
          {message}
        </p>
      )}

      <div
        role="tablist"
        aria-label="Talep durumu"
        className="inline-flex max-w-full flex-wrap gap-2 self-start rounded-[var(--radius-m)] border border-border bg-surface p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            data-testid={`sekme-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`min-h-11 rounded-[var(--radius-s)] px-4 text-sm font-semibold ${
              tab === t.key ? "bg-accent text-white" : "bg-transparent text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {data === null && <p className="py-12 text-center text-sm text-muted">Talepler yükleniyor...</p>}
      {data?.items.length === 0 && <p className={`${CARD} py-12 text-center text-sm text-muted`}>Bu sekmede talep yok.</p>}
      {data?.items.map((r) => {
        const editable = r.status === "BEKLEMEDE" || r.status === "ONAYLANDI";
        return (
          <section key={r.id} data-testid={`talep-${r.code}`} data-status={r.status} className={`${CARD} min-w-0 overflow-hidden`}>
            <div className="border-b border-border bg-[var(--muted-bg)] px-4 py-3">
              <h2 className="break-words text-base font-bold">
                {r.code} - {r.requestedByName}
                {partlyDelivered(r) ? " (kısmi teslim, kalan bekliyor)" : ""}
              </h2>
              {r.note && <p className="mt-1 break-words text-sm text-muted">Not: {r.note}</p>}
              {r.rejectReason && <p className="mt-1 break-words text-sm text-danger">Sebep: {r.rejectReason}</p>}
            </div>
            <div className="overflow-x-auto" role="region" tabIndex={0} aria-label={`${r.code} talep kalemleri`}>
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-border bg-bg font-semibold text-muted">
                    <th scope="col" className="px-4 py-3">Ürün</th>
                    <th scope="col" className="px-4 py-3 text-center">İstenen</th>
                    <th scope="col" className="px-4 py-3 text-center">Depoda</th>
                    <th scope="col" className="px-4 py-3 text-center">Aciliyet</th>
                    {r.status === "ONAYLANDI" && <th scope="col" className="px-4 py-3 text-center">Onaylanan / teslim edilen</th>}
                    <th scope="col" className="px-4 py-3 text-center">
                      {r.status === "ONAYLANDI" ? "Şimdi teslim" : r.status === "BEKLEMEDE" ? "Onay" : "Onaylanan / Teslim"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((i, idx) => (
                    <tr key={i.id} className={`${idx % 2 === 0 ? "bg-surface" : "bg-bg"} hover:bg-accent/10`}>
                      <td className="px-4 py-3 font-bold">{i.productName}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{i.requestedQty}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{i.poolRemaining}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded border px-2 py-1 text-[13px] font-bold ${
                            i.urgency === "ACIL" ? "border-danger bg-[var(--danger-bg)] text-danger" : "border-border text-muted"
                          }`}
                        >
                          {i.urgency === "ACIL" ? "Acil" : "Normal"}
                        </span>
                      </td>
                      {r.status === "ONAYLANDI" && (
                        <td className="px-4 py-3 text-center tabular-nums">{`${i.approvedQty ?? 0} / ${i.deliveredQty ?? 0}`}</td>
                      )}
                      <td className="px-4 py-3 text-center tabular-nums">
                        {editable ? (
                          <input
                            type="number"
                            min={0}
                            max={r.status === "BEKLEMEDE" ? i.requestedQty : openQty(i)}
                            aria-label={`${i.productName} adet`}
                            data-testid={`adet-${i.id}`}
                            value={qty[i.id] ?? ""}
                            onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
                            className={`${FIELD} w-24 text-center font-bold ${idx % 2 === 0 ? "bg-bg" : "bg-surface"}`}
                          />
                        ) : (
                          `${i.approvedQty ?? 0} / ${i.deliveredQty ?? 0}`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editable && (
              <div className="flex flex-wrap items-end gap-3 border-t border-border p-4">
                <label className="flex min-w-0 flex-1 basis-full flex-col gap-1 text-sm font-semibold sm:basis-64">
                  Sebep
                  <input
                    placeholder="Sebep (en az 3 karakter)"
                    aria-label="Sebep"
                    data-testid={`sebep-${r.code}`}
                    value={reason[r.id] ?? ""}
                    onChange={(e) => setReason((x) => ({ ...x, [r.id]: e.target.value }))}
                    className={FIELD}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {r.status === "BEKLEMEDE" && (
                    <Button variant="primary" data-testid={`onayla-${r.code}`} onClick={() => void act(r, "approve")}>
                      Onayla
                    </Button>
                  )}
                  {r.status === "ONAYLANDI" && (
                    <Button variant="primary" data-testid={`teslim-${r.code}`} onClick={() => void act(r, "deliver")}>
                      Teslim et
                    </Button>
                  )}
                  {r.status === "BEKLEMEDE" && (
                    <Button data-testid={`reddet-${r.code}`} onClick={() => void act(r, "reject")}>
                      Reddet
                    </Button>
                  )}
                  <Button data-testid={`iptal-${r.code}`} onClick={() => void act(r, "cancel")}>
                    {partlyDelivered(r) ? "Kalanı kapat" : "İptal et"}
                  </Button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
