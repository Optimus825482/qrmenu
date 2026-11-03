"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { PlaybackSpeed } from "./playback";
import { businessDateOf } from "./radarStore";

export type ReplayPlayerProps = {
  open: boolean;
  nowMs: number;
  retentionDays: number;
  hotelId: string;
  onStart(params: { hotelId: string; day: string; from: string; to: string; speed: PlaybackSpeed }): Promise<void>;
  onClose(): void;
};

const DAY_MS = 86_400_000;

function formatHm(ms: number): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

export function ReplayPlayer({
  open,
  nowMs,
  retentionDays,
  hotelId,
  onStart,
  onClose,
}: ReplayPlayerProps) {
  const maxDay = useMemo(() => businessDateOf(nowMs), [nowMs]);
  const minDay = useMemo(
    () => businessDateOf(nowMs - Math.max(1, retentionDays) * DAY_MS),
    [nowMs, retentionDays],
  );
  const defaultFrom = useMemo(() => formatHm(nowMs - 10 * 60_000), [nowMs]);

  const [day, setDay] = useState<string>(maxDay);
  const [from, setFrom] = useState<string>(defaultFrom);
  const [to, setTo] = useState<string>("24:00");
  const [speed, setSpeed] = useState<PlaybackSpeed>(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const outOfBounds = day < minDay || day > maxDay;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (outOfBounds) {
      setError(`Seçilen gün saklama sınırları (${minDay} ile ${maxDay}) dışında.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onStart({ hotelId, day, from, to, speed });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gün tekrarı başlatılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rd-help" role="dialog" aria-label="Gün tekrarı">
      <div className="rd-row">
        <h3>Gün tekrarı başlat</h3>
        <button type="button" className="rd-link" onClick={onClose}>
          Kapat
        </button>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="rd-replay-form">
        <label className="rd-field">
          <span>İş günü</span>
          <input
            type="date"
            aria-label="İş günü"
            className="rd-select"
            min={minDay}
            max={maxDay}
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setError(null);
            }}
            required
          />
        </label>
        <label className="rd-field">
          <span>Başlangıç saati</span>
          <input
            type="text"
            aria-label="Başlangıç saati"
            className="rd-select"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="00:00"
            required
          />
        </label>
        <label className="rd-field">
          <span>Bitiş saati</span>
          <input
            type="text"
            aria-label="Bitiş saati"
            className="rd-select"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="24:00"
            required
          />
        </label>
        <label className="rd-field">
          <span>Hız</span>
          <select
            aria-label="Hız"
            className="rd-select"
            value={String(speed)}
            onChange={(e) => setSpeed(Number(e.target.value) as PlaybackSpeed)}
          >
            <option value="1">1x</option>
            <option value="10">10x</option>
            <option value="60">60x</option>
          </select>
        </label>
        {outOfBounds ? (
          <p role="alert" className="rd-error-text">
            Seçilen gün saklama sınırları ({minDay} – {maxDay}) dışında.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rd-error-text">
            {error}
          </p>
        ) : null}
        <div className="rd-row">
          <button type="submit" className="rd-chip" disabled={busy || outOfBounds}>
            {busy ? "Yükleniyor…" : "Tekrarı başlat"}
          </button>
        </div>
      </form>
    </div>
  );
}
