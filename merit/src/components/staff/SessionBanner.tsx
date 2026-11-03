"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";

const POLL_MS = 60_000;

export type SessionBannerProps = {
  /** ISO time the session ends (sunucu), null when unknown. */
  sessionEndsAt: string | null;
  /** Show the strip when at most this many minutes remain. */
  warnMinutes?: number;
};

/** Minutes left (rounded up) for a session ending at `endsAt`, with the server/client clock offset applied. */
export function minutesLeft(endsAt: number, now: number, offsetMs: number): number {
  return Math.ceil((endsAt - (now + offsetMs)) / 60_000);
}

/**
 * Kalıcı oturum şeridi: oturumun bitişine `warnMinutes` kala "Oturum 42 dk sonra kapanacak". Bitiş
 * zamanı ve sunucu saati /api/session/status'tan dakikada bir (yalnız sayfa görünürken) yenilenir.
 */
export function SessionBanner({ sessionEndsAt, warnMinutes = 60 }: SessionBannerProps) {
  // The end time the server last reported (polling); until then the one rendered with the page.
  const [polledEnd, setEndsAt] = useState<number | null>(null);
  const endsAt = polledEnd ?? (sessionEndsAt ? Date.parse(sessionEndsAt) : null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const sentAt = Date.now();
        const response = await fetch("/api/session/status", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok || stopped) return;
        const body = (await response.json()) as { expiresAt: string; now: string };
        // The server clock at mid-flight, compared with ours: removes the device clock error.
        setOffset(Date.parse(body.now) - (sentAt + Date.now()) / 2);
        setEndsAt(Date.parse(body.expiresAt));
        setNow(Date.now());
      } catch {
        // offline or restarting: keep the last known end time
      }
    };
    const timer = setInterval(() => {
      setNow(Date.now());
      void poll();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (endsAt === null) return null;
  const left = minutesLeft(endsAt, now, offset);
  if (left > warnMinutes) return null;
  return (
    <div className="staff-banner" data-tone="warn" role="status" data-testid="session-banner">
      <Icon name="clock" size={20} />
      {left > 0 ? `Oturum ${left} dk sonra kapanacak` : "Oturum süresi doldu; yeniden giriş yapman gerekecek"}
    </div>
  );
}
