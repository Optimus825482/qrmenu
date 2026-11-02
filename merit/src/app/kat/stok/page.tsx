"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Status = "STOKOUT" | "KRITIK" | "DIKKAT" | "NORMAL";
type Row = {
  productId: string;
  name: string;
  groupName: string;
  total: number;
  used: number;
  remaining: number;
  critical: number;
  status: Status;
};
type Data = { rows: Row[]; counts: Record<Status, number>; canEditCritical: boolean };

const LABEL: Record<Status, string> = { STOKOUT: "Stok yok", KRITIK: "Kritik", DIKKAT: "Dikkat", NORMAL: "Normal" };

export default function KatStokPage() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/minibar/stock", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? "Stoklar yüklenemedi");
      return;
    }
    setData(json as Data);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function saveLevel(productId: string) {
    const level = Number(drafts[productId]);
    const res = await fetch("/api/minibar/stock", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, level }),
    });
    const json = await res.json();
    setMessage(res.ok ? "Kritik seviye güncellendi" : (json.error ?? "Kaydedilemedi"));
    if (res.ok) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[productId];
        return next;
      });
      await load();
    }
  }

  const rows = (data?.rows ?? []).filter((r) => filter === "ALL" || r.status === filter);

  return (
    <main data-testid="kat-stok" style={{ padding: 16 }}>
      <h1>Stoklarım</h1>
      <p>
        <Link href="/kat/kritik">Kritik stoklar</Link> | <Link href="/kat/talep">Ek talep</Link> |{" "}
        <a href="/api/minibar/stock/export" data-testid="stok-excel">
          Excel indir
        </a>
      </p>
      {message && <p role="status" data-testid="stok-mesaj">{message}</p>}
      <div role="group" aria-label="Durum süzgeci" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" data-testid="chip-ALL" aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")}>
          Tümü ({data?.rows.length ?? 0})
        </button>
        {(Object.keys(LABEL) as Status[]).map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`chip-${s}`}
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
          >
            {LABEL[s]} ({data?.counts[s] ?? 0})
          </button>
        ))}
      </div>
      <table data-testid="stok-tablo" style={{ width: "100%", marginTop: 12 }}>
        <thead>
          <tr>
            <th align="left">Ürün</th>
            <th align="left">Grup</th>
            <th>Toplam</th>
            <th>Kullanılan</th>
            <th>Kalan</th>
            <th>Kritik</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.productId} data-testid={`stok-satir-${r.productId}`} data-status={r.status}>
              <td>
                <Link href={`/kat/urun/${r.productId}`}>{r.name}</Link>
              </td>
              <td>{r.groupName}</td>
              <td align="center">{r.total}</td>
              <td align="center">{r.used}</td>
              <td align="center">{r.remaining}</td>
              <td align="center">
                {data?.canEditCritical ? (
                  <span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label={`${r.name} kritik seviye`}
                      data-testid={`kritik-input-${r.productId}`}
                      value={drafts[r.productId] ?? String(r.critical)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.productId]: e.target.value }))}
                      style={{ width: 70 }}
                    />
                    {drafts[r.productId] !== undefined && (
                      <button type="button" data-testid={`kritik-kaydet-${r.productId}`} onClick={() => void saveLevel(r.productId)}>
                        Kaydet
                      </button>
                    )}
                  </span>
                ) : (
                  r.critical
                )}
              </td>
              <td align="center">{LABEL[r.status]}</td>
            </tr>
          ))}
          {data && rows.length === 0 && (
            <tr>
              <td colSpan={7}>Bu süzgeçte ürün yok.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
