"use client";

import { useEffect } from "react";
import { alertDialog } from "../confirm";
import { windowStore } from "../windowStore";

type Summary = { hotelName: string; expired: number; near: number };

/**
 * Minibar system manager: once per browser session, right after the desktop opens, the SKT state of the hotel
 * stocks is shown; closing the notice opens Otel Deposu (SKT takibi tab). The same warning is in the bell.
 */
export function ExpiryLoginNotice({
  userId,
  enabled,
  desktop = true,
}: {
  userId: string;
  enabled: boolean;
  /** false on the mobile shell: there is no window to open, the notice only informs. */
  desktop?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    const key = `merit.skt-notice.${userId}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      // without storage the notice simply shows on every load
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/minibar/expiry-alerts", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const { hotels } = (await res.json()) as { hotels: Summary[] };
        if (cancelled || hotels.length === 0) return;
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          // see above
        }
        const lines = hotels.map((h) => {
          const parts = [h.expired > 0 ? `${h.expired} partinin SKT'si geçti` : "", h.near > 0 ? `${h.near} partinin SKT'si yaklaşıyor` : ""];
          return `${h.hotelName}: ${parts.filter(Boolean).join(", ")}`;
        });
        await alertDialog({
          title: "SKT uyarısı",
          message: desktop
            ? `${lines.join("\n")}\n\nTamam'a basınca Otel Deposu açılır; ayrıntılar "SKT takibi" sekmesinde.`
            : `${lines.join("\n")}\n\nAyrıntılar: Otel Deposu › SKT takibi.`,
        });
        if (!cancelled && desktop) windowStore.getState().open("minibar.stok");
      } catch {
        // the notice is a convenience; the bell still carries the warning
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, enabled, desktop]);
  return null;
}
