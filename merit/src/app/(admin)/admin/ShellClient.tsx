"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WelcomeOpener } from "@/components/guide/WelcomeOpener";
import { registerCoreApps } from "@/modules/core/apps";
import { registerMenuApps } from "@/modules/menu/apps";
import { registerOrderApps } from "@/modules/order/apps";
import { registerMinibarApps } from "@/modules/minibar/apps";
import { fontVariables } from "@/shell/appearance";
import { notify, setNotifySurface } from "@/shell/notify";
import { ConfirmDialog } from "@/shell/components/ConfirmDialog";
import { Desktop } from "@/shell/components/Desktop";
import { FooterBand } from "@/shell/components/FooterBand";
import { MobileShell } from "@/shell/components/MobileShell";
import type { HotelInfo } from "@/shell/components/HotelPicker";
import { StartMenu } from "@/shell/components/StartMenu";
import { Taskbar } from "@/shell/components/Taskbar";
import { TrayBalloonHost } from "@/shell/components/TrayBalloon";
import { Window } from "@/shell/components/Window";
import { getApps } from "@/shell/registry";
import type { ShellPrefs } from "@/shell/types";
import { useShellMode } from "@/shell/useShellMode";
import { useSse } from "@/shell/useSse";
import { useShellPersistence } from "@/shell/useShellPersistence";
import { MAX_WINDOWS, useWindowStore, windowStore } from "@/shell/windowStore";

registerCoreApps();
registerMenuApps();
registerOrderApps();
registerMinibarApps();

export type ShellClientProps = {
  user: { id: string; fullName: string; roleId: string };
  hotels: HotelInfo[];
  /** visibleScreens(ctx, hotelId) for every hotel in scope: screen codes the user may view there. */
  screensByHotel: Record<string, string[]>;
  prefs: ShellPrefs | null;
  confirmSimpleActions: boolean;
  /** Setting shell.mobileDefinitions: default of the mobile "Tanımlamaları mobilde aç" switch. */
  mobileDefinitions: boolean;
  /** The access summary is unacknowledged (first login / changed permissions): open "Erişimim" at once. */
  welcomeNeeded?: boolean;
  /** The session hotel, the context of that window. */
  welcomeHotelId?: string;
};

/**
 * Client root of Merit OS: wires the store to the page and shows the XP desktop, or the Android
 * shell on narrow screens (see useShellMode).
 */
export function ShellClient({
  user,
  hotels,
  screensByHotel,
  prefs,
  confirmSimpleActions,
  mobileDefinitions,
  welcomeNeeded = false,
  welcomeHotelId = "",
}: ShellClientProps) {
  // Desktop and Start menu show the union over the user's hotels; windows bound to a hotel are
  // limited per hotel by the store (screensByHotel).
  const apps = useMemo(() => {
    const visible = new Set(Object.values(screensByHotel).flat());
    return getApps().filter((a) => visible.has(a.screenCode));
  }, [screensByHotel]);
  const appIds = useMemo(() => apps.map((a) => a.id), [apps]);
  useShellPersistence({
    userId: user.id,
    hotels,
    appIds,
    screensByHotel,
    serverPrefs: prefs,
    confirmSimpleActions,
  });

  // A permission change for this user's role: re-run the server page so screensByHotel (and the
  // icons/Start menu derived from it) follow the new matrix without a reload.
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useSse(
    (e) => {
      const payload = e.payload as { entity?: unknown; roleId?: unknown } | undefined;
      if (payload?.entity !== "permission" || payload.roleId !== user.roleId) return;
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 300);
    },
    ["definition.changed"],
  );
  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const mode = useShellMode();
  // Feedback surface follows the shell: tray balloon on the XP desktop, snackbar on the Android shell.
  useEffect(() => {
    setNotifySurface(mode === "mobile" ? "snackbar" : "xp");
  }, [mode]);
  const ready = useWindowStore((s) => s.ready);
  const order = useWindowStore((s) => s.order);
  const theme = useWindowStore((s) => s.theme);
  const fontScale = useWindowStore((s) => s.fontScale);
  const fontFamily = useWindowStore((s) => s.fontFamily);
  const footerBand = useWindowStore((s) => s.footerBand);
  const wallpaperColor = useWindowStore((s) => s.wallpaperColor);
  const [startOpen, setStartOpen] = useState(false);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const openApp = useCallback((appId: string) => {
    const store = windowStore.getState();
    if (store.open(appId) === null && store.order.length >= MAX_WINDOWS) {
      notify.error(`En fazla ${MAX_WINDOWS} pencere açılabilir. Yenisini açmak için bir pencereyi kapatın.`, { title: "Pencere sınırı" });
    }
  }, []);
  const closeStart = useCallback(() => setStartOpen(false), []);

  // Same persistence for both shells (appearance, layout). Both share the tab's one SSE connection
  // (sseStore), which survives a switch between them.
  if (mode === "mobile") {
    return ready ? <MobileShell user={user} mobileDefinitions={mobileDefinitions} /> : null;
  }

  return (
    <div
      className="xp-shell"
      data-theme={theme}
      data-footer={footerBand ? "on" : "off"}
      style={fontVariables(fontScale, fontFamily, wallpaperColor)}
    >
      {ready ? (
        <>
          <Desktop apps={apps} onOpenApp={openApp} />
          <div className="xp-windows">
            {order.map((id) => (
              <Window key={id} id={id} hotels={hotels} userName={user.fullName} />
            ))}
          </div>
          <div id="xp-dialog-root" className="xp-dialog-root" />
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
          {footerBand ? <FooterBand /> : null}
          <WelcomeOpener needed={welcomeNeeded} hotelId={welcomeHotelId} />
          <ConfirmDialog />
          <TrayBalloonHost />
        </>
      ) : null}
    </div>
  );
}
