"use client";

import { useCallback, useEffect, useState } from "react";

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
    const res = await fetch(`/api/minibar/stock-requests?status=${status}&pageSize=100`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? "Talepler yüklenemedi");
      return;
    }
    setData(json as Data);
    const next: Record<string, string> = {};
    for (const r of json.items as Req[]) {
      for (const i of r.items) {
        next[i.id] = String(r.status === "ONAYLANDI" ? (i.approvedQty ?? 0) : i.requestedQty);
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
    const res = await fetch(`/api/minibar/stock-requests/${r.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMessage(res.ok ? "İşlem tamamlandı" : (json.error ?? "İşlem yapılamadı"));
    await load();
  }

  return (
    <main data-testid="depo-talepler" style={{ padding: 16 }}>
      <h1>Ek talepler</h1>
      {data && (
        <p data-testid="talep-kpi">
          Bekleyen {data.kpis.pending} | Onaylanan {data.kpis.approved} | Bugün teslim {data.kpis.deliveredToday}
        </p>
      )}
      {message && <p role="status" data-testid="talepler-mesaj">{message}</p>}
      <div role="tablist" style={{ display: "flex", gap: 8 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            data-testid={`sekme-${t.key}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {data?.items.length === 0 && <p>Bu sekmede talep yok.</p>}
      {data?.items.map((r) => (
        <section key={r.id} data-testid={`talep-${r.code}`} data-status={r.status} style={{ marginTop: 16 }}>
          <h2>
            {r.code} - {r.requestedByName}
          </h2>
          {r.note && <p>Not: {r.note}</p>}
          {r.rejectReason && <p>Sebep: {r.rejectReason}</p>}
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th align="left">Ürün</th>
                <th>İstenen</th>
                <th>Havuzda</th>
                <th>Aciliyet</th>
                <th>{r.status === "ONAYLANDI" ? "Teslim" : r.status === "BEKLEMEDE" ? "Onay" : "Onaylanan / Teslim"}</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.productName}</td>
                  <td align="center">{i.requestedQty}</td>
                  <td align="center">{i.poolRemaining}</td>
                  <td align="center">{i.urgency === "ACIL" ? "Acil" : "Normal"}</td>
                  <td align="center">
                    {r.status === "BEKLEMEDE" || r.status === "ONAYLANDI" ? (
                      <input
                        type="number"
                        min={0}
                        max={r.status === "BEKLEMEDE" ? i.requestedQty : (i.approvedQty ?? 0)}
                        aria-label={`${i.productName} adet`}
                        data-testid={`adet-${i.id}`}
                        value={qty[i.id] ?? ""}
                        onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
                        style={{ width: 80 }}
                      />
                    ) : (
                      `${i.approvedQty ?? 0} / ${i.deliveredQty ?? 0}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(r.status === "BEKLEMEDE" || r.status === "ONAYLANDI") && (
            <p>
              {r.status === "BEKLEMEDE" && (
                <button type="button" data-testid={`onayla-${r.code}`} onClick={() => void act(r, "approve")}>
                  Onayla
                </button>
              )}
              {r.status === "ONAYLANDI" && (
                <button type="button" data-testid={`teslim-${r.code}`} onClick={() => void act(r, "deliver")}>
                  Teslim et
                </button>
              )}{" "}
              <input
                placeholder="Sebep (en az 3 karakter)"
                aria-label="Sebep"
                data-testid={`sebep-${r.code}`}
                value={reason[r.id] ?? ""}
                onChange={(e) => setReason((x) => ({ ...x, [r.id]: e.target.value }))}
              />{" "}
              {r.status === "BEKLEMEDE" && (
                <button type="button" data-testid={`reddet-${r.code}`} onClick={() => void act(r, "reject")}>
                  Reddet
                </button>
              )}{" "}
              <button type="button" data-testid={`iptal-${r.code}`} onClick={() => void act(r, "cancel")}>
                İptal et
              </button>
            </p>
          )}
        </section>
      ))}
    </main>
  );
}
