"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { Icon } from "@/components/icons/Icon";
import type { OutletTarget } from "@/components/ops/OutletSwitcher";
import { DensityRoot } from "@/components/ui/Density";
import { SnackbarHost } from "@/components/ui/Snackbar";
import { screenForPath } from "@/modules/core/screenPaths";
import { InstallPrompt } from "./InstallPrompt";
import { isNavActive, type NavModel } from "./navModel";
import { ProfileMenu, type ProfileExtra } from "./ProfileMenu";
import { SessionBanner } from "./SessionBanner";
import { StaffBell } from "./StaffBell";
import { StaffNav } from "./StaffNav";
import { StaffTopBar } from "./StaffTopBar";
import { useLastOnlineAt, useOfflineGuard, useOnline } from "./useOnline";
import "./staff.css";

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
};

const FALLBACK_TITLES: ReadonlyArray<readonly [string, string]> = [
  ["/kat/mybar", "MyBar talepleri"],
  ["/depo", "Depo panosu"],
  ["/erisimim", "Erişimim"],
];

/** Screen name for the top bar: the nav label of the current place, else the catalogue name of the route. */
export function titleFor(pathname: string, sekme: string | null, nav: NavModel): string {
  const items = [...nav.primary, ...nav.more];
  const hit = items.find((item) => isNavActive(item, pathname, sekme) && item.id !== "more");
  if (hit) return hit.label;
  const screen = screenForPath(pathname);
  if (screen) return screen.name;
  const fallback = FALLBACK_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return fallback ? fallback[1] : "Merit";
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
}: StaffShellProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const sekme = search.get("sekme");
  const state = useOnline();
  const lastOnline = useLastOnlineAt(state);
  useOfflineGuard(state === "offline");

  const title = useMemo(() => titleFor(pathname, sekme, nav), [pathname, sekme, nav]);
  const subtitle = outletName ? `${hotelName} · ${outletName}` : hotelName;
  const showFab = nav.fab && pathname === "/garson" && sekme === "masalar";

  return (
    <DensityRoot density="personel">
      <div className="staff-shell" data-layout={layout}>
        <div className="staff-head">
          <StaffTopBar
            title={title}
            subtitle={subtitle}
            state={state}
            bell={<StaffBell />}
            profile={
              <ProfileMenu
                user={user}
                hotelName={hotelName}
                outletName={outletName}
                targets={targets}
                currentTargetIndex={currentTargetIndex}
                extraItems={profileExtras}
              />
            }
          />
          <div className="staff-banners">
            {state === "offline" ? (
              <div className="staff-banner" data-tone="danger" role="alert">
                <Icon name="wifi-off" size={20} />
                <span>Bağlantı yok — işlemler gönderilemez</span>
                {lastOnline ? <small>Son güncelleme {formatTime(lastOnline)}</small> : null}
              </div>
            ) : null}
            <SessionBanner sessionEndsAt={sessionEndsAt} warnMinutes={warnMinutes} />
            <InstallPrompt />
          </div>
        </div>
        <main className="staff-main" id="icerik" style={showFab ? { paddingBottom: "calc(var(--tap-pri) + var(--space-6))" } : undefined}>
          <div className="staff-content">{children}</div>
        </main>
        <StaffNav nav={nav} pathname={pathname} sekme={sekme} />
        {showFab && nav.fab ? (
          <Link href={nav.fab.href} className="staff-fab" data-primary="">
            <Icon name={nav.fab.icon} size={24} />
            {nav.fab.label}
          </Link>
        ) : null}
        <SnackbarHost bottomOffset={layout === "bottom" ? "76px" : "24px"} />
      </div>
    </DensityRoot>
  );
}
