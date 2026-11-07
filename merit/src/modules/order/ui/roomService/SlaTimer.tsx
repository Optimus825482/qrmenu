"use client";

import { useEffect, useState } from "react";
import { SLA_WARN_RATIO } from "@/modules/order/server/roomService/slaConstants";

export type SlaTimerState = "OK" | "WARN" | "BREACH";

/** Pure timer state at `nowMs` for a clock that started at `startMs` and is due at `dueMs`. */
export function slaTimerState(startMs: number, dueMs: number, nowMs: number): SlaTimerState {
  if (nowMs >= dueMs) return "BREACH";
  return nowMs - startMs >= (dueMs - startMs) * SLA_WARN_RATIO ? "WARN" : "OK";
}

/** "12:05" remaining, or "+03:10" once overdue. */
export function formatSlaClock(dueMs: number, nowMs: number): string {
  const diff = Math.round((dueMs - nowMs) / 1000);
  const abs = Math.abs(diff);
  const mm = String(Math.floor(abs / 60)).padStart(2, "0");
  const ss = String(abs % 60).padStart(2, "0");
  return `${diff < 0 ? "+" : ""}${mm}:${ss}`;
}

const TONE: Record<SlaTimerState, string> = {
  OK: "border-success text-success",
  WARN: "border-warn bg-warn/15 text-warn",
  BREACH: "border-danger bg-danger/10 text-danger animate-pulse",
};
const LABEL: Record<SlaTimerState, string> = { OK: "Süre var", WARN: "Süre azalıyor", BREACH: "Süre aşıldı" };

type Props = {
  startAt: Date | string;
  dueAt: Date | string;
  /** Clock not running (waiting for the phone confirmation). */
  paused?: boolean;
  /** Test/parent override of the current time (ms); otherwise a 1 s ticker is used. */
  nowMs?: number;
};

/** Countdown to the SLA deadline; colour follows the live state (OK green, WARN amber, BREACH red + pulse). */
export function SlaTimer({ startAt, dueAt, paused, nowMs }: Props) {
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => {
    if (paused || nowMs !== undefined) return;
    const update = () => setTick(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [paused, nowMs]);

  if (paused) {
    return (
      <span
        data-sla-state="PAUSED"
        className="inline-flex items-center rounded-lg border border-border px-2 py-1 text-[13px] font-semibold text-muted"
      >
        Sayaç teyitten sonra başlar
      </span>
    );
  }
  const now = nowMs ?? tick;
  const startMs = new Date(startAt).getTime();
  const dueMs = new Date(dueAt).getTime();
  if (now === null) {
    // Before mount the server and the browser disagree about "now": render a stable placeholder.
    return (
      <span data-sla-state="PENDING" className="font-mono text-[13px] text-muted">
        --:--
      </span>
    );
  }
  const state = slaTimerState(startMs, dueMs, now);
  return (
    <span
      role="timer"
      data-sla-state={state}
      aria-label={`${LABEL[state]}: ${formatSlaClock(dueMs, now)}`}
      className={`inline-flex items-center rounded-lg border px-2 py-1 font-mono text-[13px] font-black tabular-nums ${TONE[state]}`}
    >
      {formatSlaClock(dueMs, now)}
    </span>
  );
}
