"use client";

import { useState } from "react";
import { usePushSubscription } from "./usePushSubscription";

const KEY = "merit.pushBanner.until";
const SNOOZE_MS = 7 * 24 * 3600 * 1000;

function snoozed(): boolean {
  try {
    return Number(window.localStorage.getItem(KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/** Kat kabuğunda yalnız izin sorulmamışken görünen şerit; "Daha sonra" 7 gün gizler. */
export function PushBanner() {
  const { status, enable } = usePushSubscription();
  const [hidden, setHidden] = useState(() => typeof window !== "undefined" && snoozed());
  if (status !== "prompt" || hidden) return null;

  return (
    <div className="staff-banner" data-testid="push-banner" role="region" aria-label="Bildirim daveti">
      <span>Yeni MyBar taleplerini anında bildir</span>
      <button type="button" className="staff-menu-item" style={{ width: "auto" }} onClick={() => void enable()}>
        Aç
      </button>
      <button
        type="button"
        className="staff-menu-item"
        style={{ width: "auto" }}
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, String(Date.now() + SNOOZE_MS));
          } catch {
            // yazılamazsa yalnız bu oturumda gizlenir
          }
          setHidden(true);
        }}
      >
        Daha sonra
      </button>
    </div>
  );
}
