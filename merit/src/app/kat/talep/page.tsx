"use client";

import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { newRequestKey } from "@/modules/minibar/ui/requestKey";

type Urgency = "NORMAL" | "ACIL";
type Line = { productId: string; name: string; remaining: number; critical: number; suggestedQty: number; urgency: Urgency };
type ReqItem = {
  id: string;
  productName: string;
  requestedQty: number;
  approvedQty: number | null;
  deliveredQty: number | null;
};
type Req = {
  id: string;
  code: string;
  status: string;
  rejectReason: string | null;
  createdAt: string;
  items: ReqItem[];
};

const STATUS_LABEL: Record<string, string> = {
  BEKLEMEDE: "Bekliyor",
  ONAYLANDI: "Onaylandı",
  TESLIM_EDILDI: "Teslim edildi",
  REDDEDILDI: "Reddedildi",
  IPTAL: "İptal edildi",
};

const CONTROL = "min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none";
const LINK_BTN = "inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text hover:bg-bg";
const TH = "whitespace-nowrap px-3 py-2.5 text-center text-xs font-bold";

export default function KatTalepPage() {
  const [lines, setLines] = useState<Line[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [mine, setMine] = useState<Req[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      mbFetch("/api/minibar/stock-requests/suggest", { cache: "no-store" }),
      mbFetch("/api/minibar/stock-requests?mine=1", { cache: "no-store" }),
    ]);
    const sj = await s.json();
    if (s.ok) {
      const next = (sj.lines ?? []) as Line[];
      setLines(next);
      setQty(Object.fromEntries(next.map((x) => [x.productId, String(x.suggestedQty)])));
      setPicked(Object.fromEntries(next.map((x) => [x.productId, true])));
    } else {
      setMessage(sj.error ?? "Öneriler yüklenemedi");
    }
    const lj = await l.json();
    if (l.ok) setMine(lj.items as Req[]);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Same key until the request succeeds (crypto.randomUUID is missing on plain-HTTP origins).
  const [sendKey, setSendKey] = useState(newRequestKey);

  async function send() {
    const items = lines
      .filter((x) => picked[x.productId])
      .map((x) => ({ productId: x.productId, requestedQty: Number(qty[x.productId]), urgency: x.urgency }));
    setBusy(true);
    try {
      const res = await mbFetch("/api/minibar/stock-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, note: note || undefined, clientRequestId: sendKey }),
      });
      const json = await res.json();
      setMessage(res.ok ? `Talep gönderildi: ${json.code}` : (json.error ?? "Talep gönderilemedi"));
      if (res.ok) {
        setSendKey(newRequestKey());
        setNote("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    const res = await mbFetch(`/api/minibar/stock-requests/${id}/cancel`, { method: "POST" });
    const json = await res.json();
    setMessage(res.ok ? "Talep iptal edildi" : (json.error ?? "İptal edilemedi"));
    await load();
  }

  return (
    <main data-testid="kat-talep" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 text-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">Ek talep</h1>
          <p className="text-xs text-muted">Önerilen ürünler için ek stok talebi oluşturun ve taleplerinizi izleyin</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/kat/stok" className={LINK_BTN}>
            Stoklarım
          </Link>
          <Link href="/kat/kritik" className={LINK_BTN}>
            Kritik stoklar
          </Link>
        </div>
      </div>
      {message && (
        <p role="status" data-testid="talep-mesaj" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <h2 className="text-sm font-bold">Önerilen talep listesi</h2>
      {lines.length === 0 && (
        <p data-testid="oneri-bos" className="rounded-2xl border border-border bg-surface px-3 py-8 text-center text-sm text-muted">
          Önerilecek ürün yok.
        </p>
      )}
      {lines.length > 0 && (
        <div
          role="region"
          aria-label="Önerilen talep listesi"
          tabIndex={0}
          className="relative overflow-x-auto rounded-2xl border border-border bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <table data-testid="oneri-tablo" className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border bg-bg text-text">
                <th scope="col" className={TH}>
                  <span className="sr-only">Seç</span>
                </th>
                <th scope="col" className={`${TH} text-left`}>
                  Ürün
                </th>
                <th scope="col" className={TH}>
                  Kalan
                </th>
                <th scope="col" className={TH}>
                  Kritik
                </th>
                <th scope="col" className={TH}>
                  Aciliyet
                </th>
                <th scope="col" className={TH}>
                  İstenen adet
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((x, idx) => (
                <tr
                  key={x.productId}
                  data-testid={`oneri-${x.productId}`}
                  className={`border-b border-border last:border-b-0 hover:bg-accent/10 ${idx % 2 === 0 ? "bg-surface" : "bg-bg"}`}
                >
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${x.name} talebe ekle`}
                      checked={picked[x.productId] ?? false}
                      onChange={(e) => setPicked((p) => ({ ...p, [x.productId]: e.target.checked }))}
                      className="h-6 w-6 accent-accent"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-semibold">{x.name}</td>
                  <td className="px-3 py-2.5 text-center font-bold tabular-nums">{x.remaining}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{x.critical}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                        x.urgency === "ACIL" ? "border-danger bg-danger/15 text-danger" : "border-border text-muted"
                      }`}
                    >
                      {x.urgency === "ACIL" ? "Acil" : "Normal"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      aria-label={`${x.name} adet`}
                      data-testid={`oneri-adet-${x.productId}`}
                      value={qty[x.productId] ?? ""}
                      onChange={(e) => setQty((q) => ({ ...q, [x.productId]: e.target.value }))}
                      className={`${CONTROL} w-24 text-center tabular-nums`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lines.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1 basis-64 text-xs font-semibold text-muted">
            Not
            <input
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              data-testid="talep-not"
              className={`${CONTROL} mt-1 w-full`}
            />
          </label>
          <button
            type="button"
            data-mutates=""
            data-testid="talep-gonder"
            disabled={busy}
            onClick={() => void send()}
            className="min-h-11 w-full rounded-xl bg-accent px-5 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50 sm:w-auto"
          >
            Talebi Gönder
          </button>
        </div>
      )}

      <h2 className="text-sm font-bold">Taleplerim</h2>
      <ul data-testid="taleplerim" className="space-y-2.5">
        {mine.map((r) => (
          <li
            key={r.id}
            data-testid={`talep-${r.code}`}
            data-status={r.status}
            className="space-y-2 rounded-2xl border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-words text-sm">
                <strong>{r.code}</strong> - {STATUS_LABEL[r.status] ?? r.status}
                {r.rejectReason ? ` (${r.rejectReason})` : ""}
              </p>
              {r.status === "BEKLEMEDE" && (
                <button
                  type="button"
                  data-mutates=""
                  data-testid={`talep-iptal-${r.code}`}
                  onClick={() => void cancel(r.id)}
                  className="min-h-11 rounded-xl border border-danger px-4 text-sm font-semibold text-danger hover:bg-danger/10"
                >
                  İptal et
                </button>
              )}
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border bg-bg text-sm">
              {r.items.map((i) => (
                <li key={i.id} className="px-3 py-2">
                  {i.productName}: istenen {i.requestedQty}
                  {i.approvedQty !== null ? `, onaylanan ${i.approvedQty}` : ""}
                  {i.deliveredQty !== null ? `, teslim ${i.deliveredQty}` : ""}
                </li>
              ))}
            </ul>
          </li>
        ))}
        {mine.length === 0 && (
          <li className="rounded-2xl border border-border bg-surface px-3 py-8 text-center text-sm text-muted">Henüz talebiniz yok.</li>
        )}
      </ul>
    </main>
  );
}
