"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { registerCoreApps } from "@/modules/core/apps";
import { alertDialog } from "@/shell/confirm";
import { ConfirmDialog } from "@/shell/components/ConfirmDialog";
import { Desktop } from "@/shell/components/Desktop";
import { MobileShell } from "@/shell/components/MobileShell";
import type { HotelInfo } from "@/shell/components/HotelPicker";
import { StartMenu } from "@/shell/components/StartMenu";
import { Taskbar } from "@/shell/components/Taskbar";
import { Window } from "@/shell/components/Window";
import { getApps } from "@/shell/registry";
import type { ShellPrefs } from "@/shell/types";
import { useShellMode } from "@/shell/useShellMode";
import { useShellPersistence } from "@/shell/useShellPersistence";
import { MAX_WINDOWS, useWindowStore, windowStore } from "@/shell/windowStore";

registerCoreApps();

export type ShellClientProps = {
  user: { id: string; fullName: string };
  hotels: HotelInfo[];
  /** visibleScreens(ctx): screen codes the user may view. */
  screens: string[];
  prefs: ShellPrefs | null;
  confirmSimpleActions: boolean;
  /** Setting shell.mobileDefinitions: default of the mobile "Tanımlamaları mobilde aç" switch. */
  mobileDefinitions: boolean;
};

/**
 * Client root of Merit OS: wires the store to the page and shows the XP desktop, or the Android
 * shell on narrow screens (see useShellMode).
 */
export function ShellClient({
  user,
  hotels,
  screens,
  prefs,
  confirmSimpleActions,
  mobileDefinitions,
}: ShellClientProps) {
  const apps = useMemo(
    () => getApps().filter((a) => screens.includes(a.screenCode)),
    [screens],
  );
  const appIds = useMemo(() => apps.map((a) => a.id), [apps]);
  useShellPersistence({
    userId: user.id,
    hotels,
    appIds,
    serverPrefs: prefs,
    confirmSimpleActions,
  });

  const mode = useShellMode();
  const ready = useWindowStore((s) => s.ready);
  const order = useWindowStore((s) => s.order);
  const [startOpen, setStartOpen] = useState(false);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const openApp = useCallback((appId: string) => {
    const store = windowStore.getState();
    if (store.open(appId) === null && store.order.length >= MAX_WINDOWS) {
      void alertDialog({
        title: "Pencere sınırı",
        message: `En fazla ${MAX_WINDOWS} pencere açılabilir. Yenisini açmak için bir pencereyi kapatın.`,
      });
    }
  }, []);
  const closeStart = useCallback(() => setStartOpen(false), []);

  // Same persistence for both shells (wallpaper, layout); only one shell is mounted at a time, so
  // there is one SSE connection either way.
  if (mode === "mobile") {
    return ready ? <MobileShell user={user} mobileDefinitions={mobileDefinitions} /> : null;
  }

  return (
    <div className="xp-shell">
      {ready ? (
        <>
          <Desktop apps={apps} onOpenApp={openApp} />
          <div className="xp-windows">
            {order.map((id) => (
              <Window key={id} id={id} hotels={hotels} userName={user.fullName} />
            ))}
          </div>
          <Taskbar
            startOpen={startOpen}
            onToggleStart={() => setStartOpen((o) => !o)}
            startButtonRef={startButtonRef}
          />
          <StartMenu
            open={startOpen}
            apps={apps}
            userName={user.fullName}
            onOpenApp={openApp}
            onClose={closeStart}
            startButtonRef={startButtonRef}
          />
          <ConfirmDialog />
        </>
      ) : null}
    </div>
  );
}
