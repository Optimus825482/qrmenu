"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

type Data = {
  totals: { used: number; dailyAvg: number; movements: number };
  rows: { at: string; roomNumber?: string; type: string; qty: number }[];
};

const TYPE_LABEL: Record<string, string> = {
  IKAME: "İkame",
  GIRIS: "Giriş",
  IADE: "İade",
  KULLANIM: "Kullanım",
  MYBAR: "MyBar",
  DUZELTME: "Düzeltme",
  GOC: "Devir",
};

export default function KatUrunPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/minibar/stock/product/${encodeURIComponent(productId)}/history?days=30`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setData(json as Data);
      else setError(json.error ?? "Geçmiş yüklenemedi");
    }, 0);
    return () => clearTimeout(t);
  }, [productId]);

  return (
    <main data-testid="kat-urun" style={{ padding: 16 }}>
      <h1>Ürün geçmişi (son 30 gün)</h1>
      <p>
        <Link href="/kat/stok">Stoklarıma dön</Link>
      </p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p data-testid="urun-ozet">
            Toplam kullanım {data.totals.used} | günlük ortalama {data.totals.dailyAvg} | {data.totals.movements}{" "}
            hareket
          </p>
          <table data-testid="urun-tablo" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th align="left">Zaman</th>
                <th align="left">Oda</th>
                <th align="left">Tür</th>
                <th>Adet</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={`${r.at}-${i}`}>
                  <td>{new Date(r.at).toLocaleString("tr-TR", { timeZone: "Europe/Nicosia" })}</td>
                  <td>{r.roomNumber ?? "-"}</td>
                  <td>{TYPE_LABEL[r.type] ?? r.type}</td>
                  <td align="center">{r.qty}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={4}>Bu dönemde hareket yok.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
