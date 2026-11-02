"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
      fetch("/api/minibar/stock-requests/suggest", { cache: "no-store" }),
      fetch("/api/minibar/stock-requests?mine=1", { cache: "no-store" }),
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

  async function send() {
    const items = lines
      .filter((x) => picked[x.productId])
      .map((x) => ({ productId: x.productId, requestedQty: Number(qty[x.productId]), urgency: x.urgency }));
    setBusy(true);
    try {
      const res = await fetch("/api/minibar/stock-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, note: note || undefined, clientRequestId: crypto.randomUUID() }),
      });
      const json = await res.json();
      setMessage(res.ok ? `Talep gönderildi: ${json.code}` : (json.error ?? "Talep gönderilemedi"));
      if (res.ok) {
        setNote("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/minibar/stock-requests/${id}/cancel`, { method: "POST" });
    const json = await res.json();
    setMessage(res.ok ? "Talep iptal edildi" : (json.error ?? "İptal edilemedi"));
    await load();
  }

  return (
    <main data-testid="kat-talep" style={{ padding: 16 }}>
      <h1>Ek talep</h1>
      <p>
        <Link href="/kat/stok">Stoklarım</Link> | <Link href="/kat/kritik">Kritik stoklar</Link>
      </p>
      {message && <p role="status" data-testid="talep-mesaj">{message}</p>}

      <h2>Önerilen talep listesi</h2>
      {lines.length === 0 && <p data-testid="oneri-bos">Önerilecek ürün yok.</p>}
      {lines.length > 0 && (
        <table data-testid="oneri-tablo" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th />
              <th align="left">Ürün</th>
              <th>Kalan</th>
              <th>Kritik</th>
              <th>Aciliyet</th>
              <th>İstenen adet</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((x) => (
              <tr key={x.productId} data-testid={`oneri-${x.productId}`}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${x.name} talebe ekle`}
                    checked={picked[x.productId] ?? false}
                    onChange={(e) => setPicked((p) => ({ ...p, [x.productId]: e.target.checked }))}
                  />
                </td>
                <td>{x.name}</td>
                <td align="center">{x.remaining}</td>
                <td align="center">{x.critical}</td>
                <td align="center">{x.urgency === "ACIL" ? "Acil" : "Normal"}</td>
                <td align="center">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    aria-label={`${x.name} adet`}
                    data-testid={`oneri-adet-${x.productId}`}
                    value={qty[x.productId] ?? ""}
                    onChange={(e) => setQty((q) => ({ ...q, [x.productId]: e.target.value }))}
                    style={{ width: 80 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {lines.length > 0 && (
        <p>
          <label>
            Not{" "}
            <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} data-testid="talep-not" />
          </label>{" "}
          <button type="button" data-testid="talep-gonder" disabled={busy} onClick={() => void send()}>
            Talebi Gönder
          </button>
        </p>
      )}

      <h2>Taleplerim</h2>
      <ul data-testid="taleplerim">
        {mine.map((r) => (
          <li key={r.id} data-testid={`talep-${r.code}`} data-status={r.status}>
            <strong>{r.code}</strong> - {STATUS_LABEL[r.status] ?? r.status}
            {r.rejectReason ? ` (${r.rejectReason})` : ""}
            <ul>
              {r.items.map((i) => (
                <li key={i.id}>
                  {i.productName}: istenen {i.requestedQty}
                  {i.approvedQty !== null ? `, onaylanan ${i.approvedQty}` : ""}
                  {i.deliveredQty !== null ? `, teslim ${i.deliveredQty}` : ""}
                </li>
              ))}
            </ul>
            {r.status === "BEKLEMEDE" && (
              <button type="button" data-testid={`talep-iptal-${r.code}`} onClick={() => void cancel(r.id)}>
                İptal et
              </button>
            )}
          </li>
        ))}
        {mine.length === 0 && <li>Henüz talebiniz yok.</li>}
      </ul>
    </main>
  );
}
