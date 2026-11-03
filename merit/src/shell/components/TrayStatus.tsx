"use client";

import { useEffect, useState } from "react";
import { usePrinterStatus, type PrinterState } from "@/components/pos/usePrinterStatus";
import { notify } from "../notify";

export const HEALTH_POLL_MS = 30_000;

export type DbState = "ok" | "down" | "unknown";

/** Database state from `GET /api/health` (field `db`), polled every 30 s; a failed request counts as down. */
export function useDbStatus(): DbState {
  const [state, setState] = useState<DbState>("unknown");
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const body = (await res.json()) as { db?: string };
        if (alive) setState(body.db === "ok" ? "ok" : "down");
      } catch {
        if (alive) setState("down");
      }
    };
    void check();
    const timer = setInterval(() => void check(), HEALTH_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return state;
}

const PRINTER_TEXT: Record<PrinterState, string> = {
  ok: "Yazıcı: çevrimiçi",
  error: "Yazıcı: yanıt yok veya hata",
  unknown: "Yazıcı: durum bilinmiyor",
};

const DB_TEXT: Record<DbState, string> = {
  ok: "Veritabanı: bağlı",
  down: "Veritabanı: ulaşılamıyor",
  unknown: "Veritabanı: denetleniyor",
};

function TrayIcon({ kind, state, text, children }: { kind: string; state: string; text: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="xp-tray-icon"
      data-testid={`tray-${kind}`}
      data-state={state}
      title={text}
      aria-label={text}
      onClick={() => notify.info(text)}
    >
      {children}
    </button>
  );
}

/** Receipt printer of the session outlet: initial state from the last ping, then printer.* events. */
export function PrinterTray({ initial }: { initial: PrinterState }) {
  const { state, reason } = usePrinterStatus(initial);
  const text = reason && state === "error" ? `${PRINTER_TEXT.error} (${reason})` : PRINTER_TEXT[state];
  return (
    <TrayIcon kind="printer" state={state} text={text}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="none" stroke="currentColor" strokeWidth="2" d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />
      </svg>
    </TrayIcon>
  );
}

export function DbTray() {
  const state = useDbStatus();
  return (
    <TrayIcon kind="db" state={state} text={DB_TEXT[state]}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <ellipse cx="12" cy="6" rx="7" ry="3" fill="none" stroke="currentColor" strokeWidth="2" />
        <path fill="none" stroke="currentColor" strokeWidth="2" d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
      </svg>
    </TrayIcon>
  );
}
