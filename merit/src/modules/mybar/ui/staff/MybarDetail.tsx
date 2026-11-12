"use client";

import { useState } from "react";
import type { MybarRow } from "../../server/requests";
import { rowStatusLabel } from "./format";

const time = (d: Date | string) =>
  new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Read-only view of one request: items (asked / added / missing / pool), the guest's note and the timeline. No prices. */
export function MybarDetail({ row }: { row: MybarRow }) {
  const [original, setOriginal] = useState(false);
  const showPool = row.status === "BEKLEMEDE" && row.items.some((i) => i.poolRemaining !== null);
  const events: { label: string; at: Date | string; by?: string | null; note?: string | null }[] = [
    { label: "Talep alındı", at: row.createdAt },
  ];
  if (row.seenAt) events.push({ label: "Görüldü", at: row.seenAt, by: row.seenByName });
  if (row.completedAt) events.push({ label: "Tamamlandı", at: row.completedAt, by: row.completedByName, note: row.closeNote });
  if (row.cancelledAt) events.push({ label: "İptal edildi", at: row.cancelledAt, by: row.cancelledByName, note: row.cancelNote });

  return (
    <div className="space-y-4" data-testid="mybar-detail">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-text">Oda {row.roomNumber}</span>
        <span className="text-muted">{row.floorName}</span>
        <span data-testid="detail-status" className="rounded-full border border-border bg-bg px-2.5 py-0.5 text-xs font-semibold text-text">
          {rowStatusLabel(row)}
        </span>
        {row.closedWithMissing ? (
          <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-semibold text-text">Eksiklerle kapatıldı</span>
        ) : null}
      </div>

      {row.items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full text-sm">
            <caption className="sr-only">Talep edilen ürünler</caption>
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Ürün</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">İstenen</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Eklenen</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Kalan</th>
                {showPool ? <th scope="col" className="px-3 py-2 text-right font-semibold">Depo</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {row.items.map((it) => (
                <tr key={it.productId}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-text">{it.name}</th>
                  <td className="px-2 py-2 text-right tabular-nums">{it.requestedQty}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{it.deliveredQty}</td>
                  <td className={`px-2 py-2 text-right font-bold tabular-nums ${it.remainingQty > 0 ? "text-danger" : "text-text"}`}>
                    {it.remainingQty}
                  </td>
                  {showPool ? <td className="px-3 py-2 text-right tabular-nums">{it.poolRemaining ?? "-"}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">Ürün seçilmedi, yalnız not var.</p>
      )}

      {row.note ? (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-text">
          <span className="font-semibold">Misafir notu: </span>
          <span data-testid="detail-note">{original || !row.noteTr ? row.note : row.noteTr}</span>
          {row.noteTr ? (
            <button
              type="button"
              aria-pressed={original}
              onClick={() => setOriginal((v) => !v)}
              style={{ minHeight: "var(--tap-action)" }}
              className="mt-1 block text-xs font-semibold text-accent underline"
            >
              {original ? "Türkçesini göster" : `Orijinali göster${row.noteSrcLang ? ` (${row.noteSrcLang.toUpperCase()})` : ""}`}
            </button>
          ) : null}
        </div>
      ) : null}

      <ol className="space-y-1 border-s-2 border-border ps-3 text-sm" aria-label="Talep geçmişi">
        {events.map((e) => (
          <li key={e.label} className="text-text">
            <span className="font-semibold">{e.label}</span>
            <span className="text-muted"> · {time(e.at)}{e.by ? ` · ${e.by}` : ""}</span>
            {e.note ? <p className="text-xs text-muted">{e.note}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
