import { compareRadarEvents } from "../events";
import type { RadarEvent } from "../types";

export type PlaybackSpeed = 1 | 10 | 60;

export type PlaybackOptions = {
  startMs: number;
  endMs: number;
  speed: PlaybackSpeed;
};

export type PlaybackController = {
  /** Advances virtual clock by `realDtMs * speed` (when playing) and returns events crossed in `(prevMs, nextMs]`. */
  advance(realDtMs: number): RadarEvent[];
  /** Seeks virtual clock to `ms` (clamped to `[startMs, endMs]`). */
  seek(ms: number): void;
  /** Sets playback speed (`1 | 10 | 60`); throws on invalid speed. */
  setSpeed(s: PlaybackSpeed): void;
  /** Toggles play / pause. */
  toggle(): void;
  /** True when virtual clock has reached `endMs`. */
  atEnd(): boolean;
  /** Current virtual clock timestamp (ms). */
  virtualMs(): number;
  /** Current play/pause state. */
  playing(): boolean;
  /** Current speed (`1 | 10 | 60`). */
  speed(): PlaybackSpeed;
};

const VALID_SPEEDS = new Set<number>([1, 10, 60]);
const eventMs = (e: RadarEvent): number => Date.parse(e.at) || 0;

function assertValidSpeed(s: number): asserts s is PlaybackSpeed {
  if (!VALID_SPEEDS.has(s)) {
    throw new Error(`Geçersiz oynatma hızı: ${s}`);
  }
}

/** First index in `sorted` whose timestamp is strictly greater than `ms` (or `>= ms` when `inclusive`). */
function findIndexAfter(sorted: RadarEvent[], ms: number, inclusive = false): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const t = eventMs(sorted[mid]);
    if (inclusive ? t < ms : t <= ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Pure virtual-clock playback controller for day replay (`1x`, `10x`, `60x`).
 */
export function createPlayback(events: RadarEvent[], opts: PlaybackOptions): PlaybackController {
  assertValidSpeed(opts.speed);
  const startMs = opts.startMs;
  const endMs = Math.max(opts.startMs, opts.endMs);
  const sorted = events.slice().sort(compareRadarEvents);

  let curMs = startMs;
  let spd: PlaybackSpeed = opts.speed;
  let isPlaying = true;
  // At initial `startMs`, include events at `startMs` itself on the first advance.
  let idx = findIndexAfter(sorted, startMs, true);

  return {
    advance(realDtMs: number): RadarEvent[] {
      if (!isPlaying || realDtMs <= 0 || curMs >= endMs) return [];
      const targetMs = Math.min(endMs, curMs + realDtMs * spd);
      const crossed: RadarEvent[] = [];
      while (idx < sorted.length && eventMs(sorted[idx]) <= targetMs) {
        crossed.push(sorted[idx]);
        idx++;
      }
      curMs = targetMs;
      return crossed;
    },

    seek(ms: number): void {
      const clamped = Math.max(startMs, Math.min(endMs, ms));
      curMs = clamped;
      idx = findIndexAfter(sorted, clamped, false);
    },

    setSpeed(s: PlaybackSpeed): void {
      assertValidSpeed(s);
      spd = s;
    },

    toggle(): void {
      if (curMs >= endMs && !isPlaying) {
        // If at end and user presses play, stay at end unless seeked, or flip state.
      }
      isPlaying = !isPlaying;
    },

    atEnd(): boolean {
      return curMs >= endMs;
    },

    virtualMs(): number {
      return curMs;
    },

    playing(): boolean {
      return isPlaying && curMs < endMs;
    },

    speed(): PlaybackSpeed {
      return spd;
    },
  };
}
