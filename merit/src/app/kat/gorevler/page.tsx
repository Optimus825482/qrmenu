"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Item = {
  itemId: string;
  taskType: string;
  roomId: string;
  roomNumber: string;
  floorName: string;
  status: string;
  arrivalTime: string | null;
  departureTime: string | null;
  dndCount: number;
  priority: number;
};
type Summary = { total: number; completed: number; waiting: number; dnd: number; incomplete: number; ratePct: number };

const TYPE_LABEL: Record<string, string> = {
  INHOUSE_KONTROL: "In House",
  ARRIVAL_KONTROL: "Arrival",
  DEPARTURE_KONTROL: "Departure",
};

/** Bare functional task list (UX T9 restyles). */
export default function GorevlerPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/minibar/tasks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Görevler alınamadı.");
      setItems(data.items);
      setSummary(data.summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görevler alınamadı.");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <main data-testid="gorevler-page">
      <h1>Görevler</h1>
      <Link href="/kat">Geri</Link>
      {error && <p data-testid="gorevler-error">{error}</p>}
      {summary && (
        <p data-testid="gorevler-summary">
          Toplam {summary.total}, tamamlanan {summary.completed}, bekleyen {summary.waiting}, DND {summary.dnd} (%{summary.ratePct})
        </p>
      )}
      {items && items.length === 0 && <p data-testid="gorevler-empty">Bugün için görev yok.</p>}
      <ul data-testid="gorevler-list">
        {items?.map((it) => (
          <li key={it.itemId} data-testid="gorevler-item" data-status={it.status}>
            <Link href={`/kat/oda-kontrol/${it.roomId}`}>Oda {it.roomNumber}</Link> — {it.floorName} — {TYPE_LABEL[it.taskType] ?? it.taskType} — {it.status}
            {it.arrivalTime ? ` — Varış ${it.arrivalTime}` : ""}
            {it.departureTime ? ` — Çıkış ${it.departureTime}` : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
