"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeritEvent } from "@/lib/realtime-events";
import { setupGuideStatusAction } from "@/modules/core/server/admin/actions/setupGuide";
import type { SetupStatus } from "@/modules/core/server/admin/setupGuide";
import { getApp, type AppProps } from "../registry";
import { useSse } from "../useSse";

const RELOAD_DEBOUNCE_MS = 500;
const LOAD_FAILED = "Kurulum durumu alınamadı";
const DEFINITION_EVENTS = ["definition.changed"] as const;

/**
 * Kurulum Rehberi (core.rehber): how far the window's hotel is set up, step by step. "Aç" opens
 * the matching Tanımlamalar panel; the list follows definition changes of the hotel live.
 */
export function SetupGuide({ hotelId, openApp, setStatus }: AppProps) {
  const [data, setData] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    if (!hotelId) return;
    const request = ++latest.current;
    let result: Awaited<ReturnType<typeof setupGuideStatusAction>> | undefined;
    try {
      result = await setupGuideStatusAction({ hotelId });
    } catch {
      result = undefined;
    }
    if (request !== latest.current) return; // a newer load owns the state
    if (!result) {
      setError(LOAD_FAILED);
    } else if (!result.ok) {
      setError(result.error.message);
    } else {
      setError(null);
      setData(result.data);
      setStatus(`Kurulum %${result.data.percent}`);
    }
  }, [hotelId, setStatus]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  useSse((e: MeritEvent) => {
    if (e.hotelId !== undefined && e.hotelId !== hotelId) return;
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
  }, DEFINITION_EVENTS);
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  if (!hotelId) return <p className="xp-defs-note">Bir otel seçilmedi.</p>;

  return (
    <div className="xp-guide">
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      {data ? (
        <>
          <div className="xp-guide-head">
            <h2>Kurulum durumu</h2>
            <span className="xp-guide-percent" data-testid="guide-percent">
              %{data.percent}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Kurulum ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={data.percent}
            className="xp-progress"
          >
            <div className="xp-progress-bar" style={{ width: `${data.percent}%` }} />
          </div>
          <ol className="xp-guide-steps" aria-label="Kurulum adımları">
            {data.steps.map((step) => {
              const available = getApp(step.openApp.appId) !== undefined;
              return (
                <li key={step.key} className="xp-guide-step" data-done={step.done}>
                  <span
                    className="xp-guide-mark"
                    role="img"
                    aria-label={step.done ? "Tamamlandı" : "Eksik"}
                  >
                    {step.done ? "✓" : "○"}
                  </span>
                  <span className="xp-guide-title">{step.title}</span>
                  {step.required ? null : <span className="xp-badge">Zorunlu değil</span>}
                  <span className="xp-guide-count">{step.count}</span>
                  <button
                    type="button"
                    className="xp-button"
                    disabled={!available}
                    title={available ? undefined : "Bu adım henüz kullanılamıyor"}
                    onClick={() =>
                      openApp(step.openApp.appId, { hotelId, panel: step.openApp.panel })
                    }
                  >
                    Aç
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : error ? null : (
        <p className="xp-defs-note">Yükleniyor…</p>
      )}
    </div>
  );
}
