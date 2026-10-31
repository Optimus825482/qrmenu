"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { registerCoreApps } from "@/shell/apps/coreApps";
import { alertDialog } from "@/shell/confirm";
import { ConfirmDialog } from "@/shell/components/ConfirmDialog";
import { Desktop } from "@/shell/components/Desktop";
import type { HotelInfo } from "@/shell/components/HotelPicker";
import { StartMenu } from "@/shell/components/StartMenu";
import { Taskbar } from "@/shell/components/Taskbar";
import { Window } from "@/shell/components/Window";
import { getApps } from "@/shell/registry";
import type { ShellPrefs } from "@/shell/types";
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
};

/** Client root of Merit OS: wires the store to the page and composes the shell parts. */
export function ShellClient({
  user,
  hotels,
  screens,
  prefs,
  confirmSimpleActions,
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
