"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMinibarLive } from "@/modules/minibar/ui/useMinibarLive";

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
  checkedAt: string | null;
};
type Summary = {
  total: number;
  completed: number;
  waiting: number;
  dnd: number;
  incomplete: number;
  ratePct: number;
  byType: Record<string, { total: number; completed: number; ratePct: number }>;
};

const TYPE_LABEL: Record<string, string> = {
  INHOUSE_KONTROL: "In House",
  ARRIVAL_KONTROL: "Arrival",
  DEPARTURE_KONTROL: "Departure",
};
const STATUS_LABEL: Record<string, string> = {
  BEKLIYOR: "Bekliyor",
  DEVAM: "Devam ediyor",
  TAMAMLANDI: "Tamamlandı",
  DND_BEKLIYOR: "DND bekliyor",
  EKSIK: "Eksik",
};
const FILTERS = [
  ["ALL", "Tümü"],
  ["BEKLEYEN", "Bekleyen"],
  ["DND", "DND"],
  ["TAMAMLANDI", "Tamamlanan"],
] as const;

/** Bare read-only task tracking for the depot (UX restyles). The floor supervisors do the work in /kat/gorevler. */
export default function DepoGorevlerPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("ALL");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/minibar/tasks?filter=${filter}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Görevler alınamadı.");
      setItems(data.items);
      setSummary(data.summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görevler alınamadı.");
    }
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useMinibarLive(["task.updated", "task.generated", "dnd.marked", "dnd.completed", "dnd.missed", "occupancy.uploaded"], () => void load());

  return (
    <main data-testid="depo-gorevler-page">
      <h1>Görev izleme</h1>
      <Link href="/depo">Geri</Link>
      {error && <p data-testid="depo-gorevler-error">{error}</p>}
      {summary && (
        <section data-testid="depo-gorevler-summary">
          <p>
            Toplam {summary.total}, tamamlanan {summary.completed}, bekleyen {summary.waiting}, DND {summary.dnd}, eksik{" "}
            {summary.incomplete} (%{summary.ratePct})
          </p>
          <ul>
            {Object.entries(summary.byType).map(([type, t]) => (
              <li key={type} data-testid="depo-gorevler-type" data-type={type}>
                {TYPE_LABEL[type] ?? type}: {t.completed}/{t.total} (%{t.ratePct})
              </li>
            ))}
          </ul>
        </section>
      )}
      <div role="group" aria-label="Süzgeç">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      {items && items.length === 0 && <p data-testid="depo-gorevler-empty">Bugün için görev yok.</p>}
      <ul data-testid="depo-gorevler-list">
        {items?.map((it) => (
          <li key={it.itemId} data-testid="depo-gorevler-item" data-status={it.status}>
            Oda {it.roomNumber} — {it.floorName} — {TYPE_LABEL[it.taskType] ?? it.taskType} — {STATUS_LABEL[it.status] ?? it.status}
            {it.dndCount > 0 ? ` — DND ${it.dndCount}` : ""}
            {it.arrivalTime ? ` — Varış ${it.arrivalTime}` : ""}
            {it.departureTime ? ` — Çıkış ${it.departureTime}` : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
