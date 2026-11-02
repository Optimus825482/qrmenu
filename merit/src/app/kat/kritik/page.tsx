"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = { productId: string; name: string; remaining: number; critical: number; missing: number; status: string };
type Data = {
  counts: { total: number; stokout: number; kritik: number; dikkat: number };
  groups: { stokout: Row[]; kritik: Row[]; dikkat: Row[] };
};

const SECTIONS: { key: keyof Data["groups"]; title: string }[] = [
  { key: "stokout", title: "Stok yok" },
  { key: "kritik", title: "Kritik" },
  { key: "dikkat", title: "Dikkat" },
];

export default function KatKritikPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch("/api/minibar/stock?view=critical", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setData(json as Data);
      else setError(json.error ?? "Kritik stoklar yüklenemedi");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <main data-testid="kat-kritik" style={{ padding: 16 }}>
      <h1>Kritik stoklar</h1>
      <p>
        <Link href="/kat/stok">Tüm stoklar</Link> | <Link href="/kat/talep">Ek talep oluştur</Link>
      </p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <p data-testid="kritik-ozet">
          Toplam {data.counts.total}: stok yok {data.counts.stokout}, kritik {data.counts.kritik}, dikkat{" "}
          {data.counts.dikkat}
        </p>
      )}
      {data && data.counts.total === 0 && <p>Kritik seviyede ürün yok.</p>}
      {data &&
        SECTIONS.map(({ key, title }) =>
          data.groups[key].length === 0 ? null : (
            <section key={key} data-testid={`kritik-${key}`}>
              <h2>
                {title} ({data.groups[key].length})
              </h2>
              <ul>
                {data.groups[key].map((r) => (
                  <li key={r.productId}>
                    <Link href={`/kat/urun/${r.productId}`}>{r.name}</Link> - kalan {r.remaining} / kritik{" "}
                    {r.critical} (eksik {r.missing})
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
    </main>
  );
}
