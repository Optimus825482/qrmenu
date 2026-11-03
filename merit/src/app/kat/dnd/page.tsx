"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMinibarLive } from "@/modules/minibar/ui/useMinibarLive";

type Row = {
  dndId: string;
  roomId: string;
  roomNumber: string;
  floorName: string;
  count: number;
  required: number;
  lastAt: string;
  status: string;
  linkedTask: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  AKTIF: "Aktif",
  TAMAMLANDI: "Tamamlandı",
  EKSIK: "Eksik kaldı",
  IPTAL: "İptal",
};

/** Bare DND list of today (UX restyles): who is still waiting for how many checks. */
export default function DndPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/minibar/dnd");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "DND listesi alınamadı.");
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "DND listesi alınamadı.");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useMinibarLive(["dnd.marked", "dnd.completed", "dnd.reminder", "dnd.missed"], () => void load());

  return (
    <main data-testid="dnd-page">
      <h1>Rahatsız Etmeyin (DND)</h1>
      <Link href="/kat" className="inline-flex min-h-11 min-w-11 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text">Geri</Link>
      {error && <p data-testid="dnd-error">{error}</p>}
      {rows && rows.length === 0 && <p data-testid="dnd-empty">Bugün DND kaydı yok.</p>}
      <ul data-testid="dnd-list">
        {rows?.map((r) => (
          <li key={r.dndId} data-testid="dnd-item" data-status={r.status}>
            <Link href={`/kat/oda-kontrol/${r.roomId}`}>Oda {r.roomNumber}</Link> — {r.floorName} — {r.count}/{r.required} —{" "}
            {STATUS_LABEL[r.status] ?? r.status}
          </li>
        ))}
      </ul>
    </main>
  );
}
