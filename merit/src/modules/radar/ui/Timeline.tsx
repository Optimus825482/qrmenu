"use client";

import { useMemo, useRef, type PointerEvent } from "react";
import { Icon } from "@/components/icons/Icon";
import { LAYER_LABELS } from "../labels";
import type { RadarEvent, RadarLayer } from "../types";
import type { PlaybackSpeed } from "./playback";
import type { RadarMode, ReplayState } from "./radarStore";
import { LAYER_ICONS } from "./Toolbar";
import { buildTimeline, timeToX, xToTime, type Gap } from "./timelineModel";

export type TimelineProps = {
  mode: RadarMode;
  nowMs: number;
  liveBufferMinutes: number;
  cursorMs: number | null;
  buffer: RadarEvent[];
  gaps: Gap[];
  replay: ReplayState | null;
  onScrub(ms: number): void;
  onGoLive(): void;
  onReplayToggle?(): void;
  onReplaySpeed?(speed: PlaybackSpeed): void;
  onReplayJumpToEnd?(): void;
  onExitReplay?(): void;
};

const TRACK_W = 600;
const MIN_MS = 60_000;
const SPEEDS: PlaybackSpeed[] = [1, 10, 60];

const fmtClock = (ms: number): string =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));

const LAYER_OFFSET_Y: Record<RadarLayer, number> = {
  MINIBAR: 4,
  SIPARIS: 11,
  ODA_SERVISI: 18,
  PERSONEL: 25,
  SISTEM: 32,
};

export function Timeline({
  mode,
  nowMs,
  liveBufferMinutes,
  cursorMs,
  buffer,
  gaps,
  replay,
  onScrub,
  onGoLive,
  onReplayToggle,
  onReplaySpeed,
  onReplayJumpToEnd,
  onExitReplay,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const range = useMemo(() => {
    if (mode === "replay" && replay) {
      return { fromMs: replay.startMs, toMs: Math.max(replay.startMs + 1000, replay.endMs) };
    }
    const span = Math.max(5, liveBufferMinutes) * MIN_MS;
    return { fromMs: nowMs - span, toMs: nowMs };
  }, [mode, replay, nowMs, liveBufferMinutes]);

  const model = useMemo(
    () => buildTimeline(buffer, gaps, range, TRACK_W),
    [buffer, gaps, range],
  );

  const headMs = mode === "replay" && replay ? replay.virtualMs : cursorMs ?? nowMs;
  const headX = timeToX(headMs, TRACK_W, range);
  const maxBucket = useMemo(
    () => Math.max(1, ...model.histogram.map((b) => b.n)),
    [model.histogram],
  );

  const seekAtClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = rect.width || TRACK_W;
    const x = clientX - rect.left;
    const targetMs = xToTime(x, w, range);
    onScrub(targetMs);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekAtClientX(e.clientX);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekAtClientX(e.clientX);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <section className="rd-timeline" aria-label="Zaman şeridi">
      <div className="rd-timeline-controls">
        {mode === "replay" && replay ? (
          <>
            <button
              type="button"
              className="rd-chip"
              onClick={onReplayToggle}
              aria-label={replay.playing ? "Duraklat" : "Oynat"}
            >
              <Icon name={replay.playing ? "pause" : "play"} size={14} />
              <span>{replay.playing ? "Duraklat" : "Oynat"}</span>
            </button>
            <div role="group" aria-label="Oynatma hızı" className="rd-tabs">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rd-chip"
                  aria-pressed={replay.speed === s}
                  onClick={() => onReplaySpeed?.(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
            <button
              type="button"
              className="rd-chip"
              disabled={replay.atEnd}
              onClick={onReplayJumpToEnd}
            >
              Sona atla
            </button>
            <button type="button" className="rd-chip" onClick={onExitReplay}>
              Canlıya dön
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="rd-chip"
              aria-label="10 saniye geri"
              onClick={() => onScrub((cursorMs ?? nowMs) - 10_000)}
            >
              <Icon name="arrow-left" size={14} />
              <span>-10 sn</span>
            </button>
            <button
              type="button"
              className="rd-chip"
              aria-label="10 saniye ileri"
              disabled={mode === "live"}
              onClick={() => {
                const next = (cursorMs ?? nowMs) + 10_000;
                if (next >= nowMs) onGoLive();
                else onScrub(next);
              }}
            >
              <span>+10 sn</span>
              <Icon name="arrow-right" size={14} />
            </button>
            <button
              type="button"
              className="rd-chip"
              aria-pressed={mode === "live"}
              onClick={onGoLive}
            >
              Canlı
            </button>
          </>
        )}
      </div>

      <div
        ref={trackRef}
        className="rd-timeline-track"
        role="slider"
        tabIndex={0}
        aria-label={mode === "replay" ? "Gün tekrarı zaman ekseni" : "Son 30 dakika zaman ekseni"}
        aria-valuemin={range.fromMs}
        aria-valuemax={range.toMs}
        aria-valuenow={headMs}
        aria-valuetext={fmtClock(headMs)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {model.gapBands.map((g, i) => (
          <div
            key={`gap-${i}`}
            className="rd-timeline-gap"
            style={{
              left: `${(g.x / TRACK_W) * 100}%`,
              width: `${(g.w / TRACK_W) * 100}%`,
            }}
            title={g.label}
            aria-label={g.label}
          >
            <span className="rd-timeline-gap-label">{g.label}</span>
          </div>
        ))}

        {model.histogram.map((b, i) => (
          <div
            key={`hist-${i}`}
            className="rd-timeline-hist"
            style={{
              left: `${(b.x / TRACK_W) * 100}%`,
              height: `${Math.max(15, Math.round((b.n / maxBucket) * 100))}%`,
            }}
            title={`${b.n} olay`}
          />
        ))}

        {model.marks.slice(-150).map((m, i) => (
          <span
            key={`mark-${i}`}
            className="rd-timeline-mark"
            style={{
              left: `${(m.x / TRACK_W) * 100}%`,
              top: `${LAYER_OFFSET_Y[m.layer]}px`,
            }}
            title={LAYER_LABELS[m.layer]}
          >
            <Icon name={LAYER_ICONS[m.layer]} size={10} />
          </span>
        ))}

        <div
          className="rd-timeline-head"
          style={{ left: `${(headX / TRACK_W) * 100}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="rd-timeline-time">
        <span>{fmtClock(range.fromMs)}</span>
        <strong>{fmtClock(headMs)}</strong>
        <span>{fmtClock(range.toMs)}</span>
      </div>
    </section>
  );
}
