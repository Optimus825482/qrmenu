"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { usePushSubscription } from "./usePushSubscription";

/**
 * Profil menüsünde "Bildirimler: Aç/Kapat" öğesi. Tarayıcı push desteklemiyorsa ya da sunucuda
 * VAPID anahtarları yoksa hiçbir şey çizmez.
 */
export function PushToggle() {
  const { status, enable, disable } = usePushSubscription();
  const [busy, setBusy] = useState(false);
  if (status === null || status === "unsupported" || status === "unavailable") return null;

  const on = status === "subscribed";
  const denied = status === "denied";
  const run = async () => {
    setBusy(true);
    try {
      await (on ? disable() : enable());
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      role="menuitem"
      className="staff-menu-item"
      data-testid="push-toggle"
      disabled={busy || denied}
      title={denied ? "Bildirimler tarayıcı ayarlarından engellenmiş" : undefined}
      onClick={() => void run()}
    >
      <Icon name={on ? "bell" : "bell-off"} size={20} />
      {denied ? "Bildirimler: Engelli" : `Bildirimler: ${on ? "Kapat" : "Aç"}`}
    </button>
  );
}
