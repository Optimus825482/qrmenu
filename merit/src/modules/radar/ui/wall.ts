import type { RadarAlert, WallView } from "../types";
import { VIEW_LABELS } from "./Toolbar";

export type WallControllerOptions = {
  views: WallView[];
  rotateSeconds: number;
  criticalHoldSeconds?: number;
  interactionPauseSeconds?: number;
};

export type WallControllerState = {
  index: number;
  view: WallView;
  secondsLeft: number;
  paused: "interaction" | "critical" | null;
  focus?: RadarAlert["ref"];
  label: string;
};

export type WallController = {
  tick(nowMs: number): void;
  interaction(nowMs: number): void;
  critical(alert: RadarAlert, nowMs: number): void;
  state(nowMs: number): WallControllerState;
  /**
   * New rotation list or period (another hotel, changed settings). The pause that is running and the place in
   * the rotation are kept: switching the hotel by hand must not end the pause that the same hand started.
   */
  configure(opts: Pick<WallControllerOptions, "views" | "rotateSeconds">): void;
};

function alertTargetView(alert: RadarAlert): WallView {
  switch (alert.kind) {
    case "SIPARIS_ONAY":
    case "SIPARIS_TAKILI":
    case "CAGRI":
      return "masa";
    case "RS_SLA":
      return "odaServisi";
    case "YAZICI_IS":
    case "YAZICI":
    case "EPOSTA":
      return "kuyruk";
    case "MYBAR":
    case "DND_EKSIK":
    case "STOK":
    case "YUKLEME":
    case "YUKLEME_HATA":
    case "MINIBAR_ONAY":
      return "kat";
    case "PERSONEL_BOSTA":
      return "personel";
    default:
      return "genel";
  }
}

/**
 * Pure rotation & hold state machine for `/radar` wall mode (Task 11).
 */
export function createWallController(opts: WallControllerOptions): WallController {
  const periodMs = (seconds: number) => Math.max(5, Math.min(300, Math.round(seconds || 20))) * 1000;
  let list: WallView[] = opts.views.length > 0 ? opts.views.slice() : ["genel"];
  let rotateMs = periodMs(opts.rotateSeconds);
  const critHoldMs = (opts.criticalHoldSeconds ?? 60) * 1000;
  const interactHoldMs = (opts.interactionPauseSeconds ?? 60) * 1000;

  let idx = 0;
  let remainingMs = rotateMs;
  let lastTickMs: number | null = null;
  let pauseKind: "interaction" | "critical" | null = null;
  let pauseUntilMs = 0;
  let criticalView: WallView | null = null;
  let criticalFocus: RadarAlert["ref"] | undefined;

  const advanceClock = (nowMs: number) => {
    if (lastTickMs === null) {
      lastTickMs = nowMs;
      return;
    }
    const dt = Math.max(0, nowMs - lastTickMs);
    lastTickMs = nowMs;

    if (pauseKind !== null) {
      if (nowMs >= pauseUntilMs) {
        pauseKind = null;
        pauseUntilMs = 0;
        criticalView = null;
        criticalFocus = undefined;
      } else {
        return;
      }
    }

    if (list.length <= 1) {
      remainingMs = rotateMs;
      return;
    }

    remainingMs -= dt;
    while (remainingMs <= 0) {
      idx = (idx + 1) % list.length;
      remainingMs += rotateMs;
    }
  };

  return {
    tick(nowMs: number): void {
      advanceClock(nowMs);
    },

    interaction(nowMs: number): void {
      advanceClock(nowMs);
      const nextUntil = nowMs + interactHoldMs;
      if (pauseKind === "critical" && pauseUntilMs > nextUntil) {
        return;
      }
      pauseKind = "interaction";
      pauseUntilMs = Math.max(pauseUntilMs, nextUntil);
    },

    critical(alert: RadarAlert, nowMs: number): void {
      advanceClock(nowMs);
      const target = alertTargetView(alert);
      pauseKind = "critical";
      pauseUntilMs = Math.max(pauseUntilMs, nowMs + critHoldMs);
      criticalView = target;
      criticalFocus = alert.ref;
    },

    configure(next): void {
      const views: WallView[] = next.views.length > 0 ? next.views.slice() : ["genel"];
      const period = periodMs(next.rotateSeconds);
      if (period === rotateMs && views.join("|") === list.join("|")) return;
      const at = views.indexOf(list[idx]!);
      list = views;
      idx = at >= 0 ? at : 0;
      rotateMs = period;
      remainingMs = Math.min(remainingMs, rotateMs);
    },

    state(nowMs: number): WallControllerState {
      advanceClock(nowMs);
      const activeView = pauseKind === "critical" && criticalView ? criticalView : list[idx]!;
      const activeIndex =
        pauseKind === "critical" && criticalView && list.includes(criticalView)
          ? list.indexOf(criticalView)
          : idx;
      const secs =
        pauseKind !== null
          ? Math.max(1, Math.ceil((pauseUntilMs - nowMs) / 1000))
          : Math.max(1, Math.ceil(remainingMs / 1000));
      const viewLabel = VIEW_LABELS[activeView];
      const label =
        pauseKind === "interaction"
          ? `Dönüş duraklatıldı · ${viewLabel} · ${secs} sn`
          : pauseKind === "critical"
            ? `Kritik uyarı · ${viewLabel} · ${secs} sn`
            : `${activeIndex + 1}/${list.length} · ${viewLabel} · ${secs} sn`;

      return {
        index: activeIndex,
        view: activeView,
        secondsLeft: secs,
        paused: pauseKind,
        ...(criticalFocus ? { focus: criticalFocus } : {}),
        label,
      };
    },
  };
}

/**
 * Views of the "Tüm kompleks" scope: the overview, and the operations whose board can be stacked per hotel.
 * A floor plan, a table plan or a queue belongs to one hotel and stays out.
 */
export function complexViews(active: ReadonlySet<string>): WallView[] {
  const out: WallView[] = ["genel"];
  if (active.has("ODA_SERVISI")) out.push("odaServisi");
  if (active.has("MINIBAR")) out.push("mybar");
  return out;
}

/**
 * Cards per lane when `hotelCount` boards share one wall screen that cannot scroll: the single-hotel cap is
 * split between the boards, never below one card.
 */
export function complexLaneCap(singleCap: number, hotelCount: number): number {
  return Math.max(1, Math.floor(singleCap / Math.max(1, hotelCount)));
}

export type SoundGateOptions = {
  minGapMs?: number;
  enabled: boolean;
};

export type SoundGate = {
  shouldPlay(nowMs: number): boolean;
  setEnabled(on: boolean): void;
  enabled(): boolean;
};

/**
 * Pure rate-limited gate for critical alert sounds on the wall display (at most once every 30s).
 */
export function createSoundGate(opts: SoundGateOptions): SoundGate {
  const minGapMs = opts.minGapMs ?? 30_000;
  let on = opts.enabled;
  let lastPlayedMs: number | null = null;

  return {
    shouldPlay(nowMs: number): boolean {
      if (!on) return false;
      if (lastPlayedMs !== null && nowMs - lastPlayedMs < minGapMs) return false;
      lastPlayedMs = nowMs;
      return true;
    },
    setEnabled(next: boolean): void {
      on = next;
    },
    enabled(): boolean {
      return on;
    },
  };
}
