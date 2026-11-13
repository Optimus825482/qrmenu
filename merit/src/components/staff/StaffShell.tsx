"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "@/components/icons/Icon";
import type { OutletTarget } from "@/components/ops/OutletSwitcher";
import { DensityRoot } from "@/components/ui/Density";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { screenForPath } from "@/modules/core/screenPaths";
import { SCREENS } from "@/modules/core/screens";
import { InstallPrompt } from "./InstallPrompt";
import { isNavActive, type NavModel } from "./navModel";
import { ProfileMenu, type ProfileExtra } from "./ProfileMenu";
import { EnvLabel } from "@/components/EnvLabel";
import { NotificationPermissionGate } from "@/components/ops/NotificationPermissionGate";
import { SessionBanner } from "./SessionBanner";
import { StaffBell } from "./StaffBell";
import { StaffNav } from "./StaffNav";
import { StaffTopBar } from "./StaffTopBar";
import type { DeviceForm } from "@/shell/deviceForm";
import { useDeviceForm } from "@/shell/useShellMode";
import { useLastOnlineAt, useOfflineGuard, useOnline, type OnlineState } from "./useOnline";
import "./staff.css";
import "./staff-xp.css";

export type StaffShellProps = {
  children: ReactNode;
  user: { fullName: string; roleCode: string; roleName: string };
  hotelName: string;
  outletName?: string;
  nav: NavModel;
  targets: OutletTarget[];
  sessionEndsAt: string | null;
  warnMinutes: number;
  layout: "bottom" | "rail";
  /** `targets[].index` of the session's current place. */
  currentTargetIndex?: number;
  /** Extra profile menu entries (Erişimim, Yardım: Task 11/12). */
  profileExtras?: ProfileExtra[];
  /** Server's User-Agent guess of the device, for the first paint (see useDeviceForm). */
  formHint?: DeviceForm;
};

const CONNECTION_TEXT: Record<OnlineState, string> = {
  online: "Bağlı",
  connecting: "Bağlanıyor…",
  offline: "Bağlantı yok",
};

/** Clock of the desktop status bar; empty until mounted so server and client markup agree. */
function StatusClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 20_000);
    return () => clearInterval(timer);
  }, []);
  return <span className="staff-status-cell staff-status-clock">{now ? formatTime(now) : ""}</span>;
}

const FALLBACK_TITLES: ReadonlyArray<readonly [string, string]> = [
  ["/kat/mybar", "MyBar talepleri"],
  ["/depo", "Depo panosu"],
  ["/erisimim", "Erişimim"],
];

/**
 * Screen name for the top bar: the catalogue name when the page is a catalogue screen itself (its catalogue path is
 * exactly this route, E2: the catalogue is the single source of screen names), else the nav label of the current
 * place, else the catalogue name of the screen that owns the route.
 */
export function titleFor(pathname: string, sekme: string | null, nav: NavModel): string {
  // Minibar screens (kat / depo) only: the other staff pages keep their nav labels.
  const own = /^\/(kat|depo)(\/|$)/.test(pathname) ? SCREENS.find((s) => s.path === pathname) : undefined;
  if (own) return own.name;
  const items = [...nav.primary, ...nav.more];
  const hit = items.find((item) => isNavActive(item, pathname, sekme) && item.id !== "more");
  if (hit) return hit.label;
  const screen = screenForPath(pathname);
  if (screen) return screen.name;
  const fallback = FALLBACK_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return fallback ? fallback[1] : "Merit";
}

/** Same breakpoint as the rail rule in staff.css: from here on the navigation is a left menu. */
const WIDE_QUERY = "(min-width: 1024px)";

function useWideWindow(fallback: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => fallback,
  );
}

/** Minibar screens: the floor team and their managers must hear about MyBar requests, DND and stock alerts. */
function needsNotifications(pathname: string): boolean {
  return pathname === "/kat" || pathname.startsWith("/kat/") || pathname === "/depo" || pathname.startsWith("/depo/");
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Nicosia" });
}

/**
 * Personel kabuğu (kat sorumlusu, garson, oda servisi, depo): 56 px üst çubuk, kalıcı şeritler
 * (çevrimdışı, oturum süresi, yükleme önerisi) ve sayfadaki TEK gezinme (alt çubuk ya da sol ray).
 */
export function StaffShell({
  children,
  user,
  hotelName,
  outletName,
  nav,
  targets,
  sessionEndsAt,
  warnMinutes,
  layout,
  currentTargetIndex,
  profileExtras,
  formHint = "phone",
}: StaffShellProps) {
  // A PC (mouse, wide window) draws the same shell as an XP window: title bar, task pane, status bar.
  const form = useDeviceForm(formHint);
  const desktop = form === "desktop";
  const pathname = usePathname();
  const search = useSearchParams();
  const sekme = search.get("sekme");
  const state = useOnline();
  const lastOnline = useLastOnlineAt(state);
  useOfflineGuard(state === "offline");

  const title = useMemo(() => titleFor(pathname, sekme, nav), [pathname, sekme, nav]);
  // Sticky page headers stop under the top bar (and its strips): its height is published as --staff-head-h.
  const shellRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const head = headRef.current;
    const shell = shellRef.current;
    if (!head || !shell || typeof ResizeObserver === "undefined") return;
    // A top bar that does not stick (the PC window form) covers nothing: 0 then.
    const apply = () =>
      shell.style.setProperty(
        "--staff-head-h",
        `${getComputedStyle(head).position === "sticky" ? head.getBoundingClientRect().height : 0}px`,
      );
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(head);
    return () => observer.disconnect();
  }, [form]);
  const subtitle = outletName ? `${hotelName} · ${outletName}` : hotelName;
  const showFab = nav.fab && pathname === "/garson" && sekme === "masalar";
  // Left menu (PC window, rail roles, wide tablets): room for every screen, the bell and the profile button.
  const wide = useWideWindow(desktop || layout === "rail");
  const side = desktop || layout === "rail" || wide;
  const tools = (
    <>
      <StaffBell nav={nav} />
      <ProfileMenu
        user={user}
        hotelName={hotelName}
        outletName={outletName}
        targets={targets}
        currentTargetIndex={currentTargetIndex}
        extraItems={profileExtras}
      />
    </>
  );

  return (
    <DensityRoot density="personel">
      <div ref={shellRef} className={desktop ? "staff-shell staff-xp" : "staff-shell"} data-layout={layout} data-form={form}>
        <div ref={headRef} className="staff-head">
          <StaffTopBar
            title={title}
            subtitle={subtitle}
            state={state}
            tools={side ? undefined : tools}
          />
          <div className="staff-banners">
            {state === "offline" ? (
              <div className="staff-banner" data-tone="danger" role="alert">
                <Icon name="wifi-off" size={20} />
                <span>Bağlantı yok — işlemler gönderilemez</span>
                {lastOnline ? <small>Son güncelleme {formatTime(lastOnline)}</small> : null}
              </div>
            ) : null}
            {needsNotifications(pathname) ? <NotificationPermissionGate screen="Minibar" subject="minibar" /> : null}
            <EnvLabel className="staff-env-label" />
            <SessionBanner sessionEndsAt={sessionEndsAt} warnMinutes={warnMinutes} />
            <InstallPrompt />
          </div>
        </div>
        <main className="staff-main" id="icerik" style={showFab ? { paddingBottom: "calc(var(--tap-pri) + var(--space-6))" } : undefined}>
          <div className="staff-content">{children}</div>
        </main>
        <StaffNav nav={nav} pathname={pathname} sekme={sekme} side={side} tools={tools} />
        {showFab && nav.fab ? (
          <Link href={nav.fab.href} className="staff-fab" data-primary="">
            <Icon name={nav.fab.icon} size={24} />
            {nav.fab.label}
          </Link>
        ) : null}
        {desktop ? (
          <footer className="staff-status">
            <span className="staff-status-cell staff-status-grow">{subtitle}</span>
            <span className="staff-status-cell">
              {user.fullName} · {user.roleName}
            </span>
            <span className="staff-status-cell" data-state={state}>
              {CONNECTION_TEXT[state]}
            </span>
            <StatusClock />
          </footer>
        ) : null}
        <SnackbarHost bottomOffset={desktop ? "40px" : layout === "bottom" ? "76px" : "24px"} />
      </div>
    </DensityRoot>
  );
}
