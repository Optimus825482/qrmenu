"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { INSTALL_COPY } from "@/shell/usePwaInstall";

const DISMISS_KEY = "merit.u.installDismissedUntil";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) > Date.now();
  } catch {
    return false;
  }
}

function snooze(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    // private window: the suggestion simply returns next visit
  }
}

/**
 * Yükleme önerisi (spec 4.4; `variant` metni seçer, varsayılan personel): tarayıcı `beforeinstallprompt` verdiyse bir kez gösterilir;
 * "Şimdi değil" öneriyi 7 gün susturur. Olay hiç gelmezse (iOS, kurulu uygulama) şerit çizilmez.
 */
export function InstallPrompt({ variant = "personel" }: { variant?: "personel" | "pos" }) {
  const copy = INSTALL_COPY[variant];
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
    if (standalone || snoozed()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!event) return null;
  const install = async () => {
    snooze();
    setEvent(null);
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // the browser refused to show it; nothing more to do
    }
  };
  return (
    <div className="staff-banner" data-tone="info" role="region" aria-label="Uygulamayı yükle">
      <Icon name="download" size={20} />
      <span style={{ flex: 1, minWidth: 200 }}>{copy.text}</span>
      <button type="button" onClick={() => void install()}>
        {copy.accept}
      </button>
      <button
        type="button"
        onClick={() => {
          snooze();
          setEvent(null);
        }}
      >
        {copy.dismiss}
      </button>
    </div>
  );
}
