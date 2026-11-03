"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { LiveBadge } from "./LiveBadge";
import { OutletSwitcher, type OutletTarget } from "./OutletSwitcher";
import { NotificationBell } from "@/shell/components/NotificationBell";
import { PwaInstallButton } from "@/shell/components/PwaInstallButton";
import { PosShell } from "@/components/pos/PosShell";
import type { PosShellData } from "@/app/(ops)/posShellData";

const waiterTabs = [
  { href: "/garson", label: "Kuyruk", path: "/garson", query: null },
  { href: "/garson?sekme=masalar", label: "Masalarım", path: "/garson", query: "masalar" },
  { href: "/garson/cagrilar", label: "Çağrılar", path: "/garson/cagrilar", query: null },
];
const cashierTabs = [
  { href: "/kasa", label: "Masalar", path: "/kasa", query: null },
  { href: "/kasa?sekme=kuyruk", label: "Kuyruk", path: "/kasa", query: "kuyruk" },
  { href: "/kasa?sekme=cagrilar", label: "Çağrılar", path: "/kasa", query: "cagrilar" },
  { href: "/kasa/yazici", label: "Yazıcı", path: "/kasa/yazici", query: null },
  { href: "/kasa/iptal", label: "İptal", path: "/kasa/iptal", query: null },
];
const roomServiceTabs = [
  { href: "/oda-servisi", label: "Talepler", path: "/oda-servisi", query: null },
  { href: "/oda-servisi?sekme=teyit", label: "Telefon Teyidi", path: "/oda-servisi", query: "teyit" },
  { href: "/oda-servisi?sekme=teslim", label: "Teslimat & SLA", path: "/oda-servisi", query: "teslim" },
  { href: "/oda-servisi?sekme=gecmis", label: "Geçmiş", path: "/oda-servisi", query: "gecmis" },
];

export function OpsShell({ children, outletName, hotelName, fullName, targets, outletId, pos }: { children: React.ReactNode; outletName: string; hotelName: string; fullName: string; targets: OutletTarget[]; outletId?: string; pos?: PosShellData }) {
  const path = usePathname();
  const search = useSearchParams();
  const isKiosk = path.startsWith("/kasa");
  // Kasa ve KDS dokunmatik POS kabuğunu kullanır; garson / oda servisi eski sekmeli kabukta kalır (UX T8).
  if (isKiosk && pos?.kasa) {
    return <PosShell context="kasa" outletName={outletName} hotelName={hotelName} fullName={fullName} rail={pos.kasa.rail} printer={pos.kasa.printer} outletId={outletId} targets={targets}>{children}</PosShell>;
  }
  if (path.startsWith("/kds") && pos?.kds) {
    return <PosShell context="kds" outletName={outletName} hotelName={hotelName} fullName={fullName} rail={pos.kds.rail} printer={null} outletId={outletId} targets={targets}>{children}</PosShell>;
  }
  const isRoomService = path.startsWith("/oda-servisi");
  const tabs = isKiosk ? cashierTabs : isRoomService ? roomServiceTabs : path.startsWith("/kds") ? [] : waiterTabs;
  const containerClass = isKiosk || isRoomService ? "mx-auto w-full max-w-[1700px] px-3 sm:px-6" : "mx-auto max-w-5xl px-4";

  return <div className="min-h-dvh bg-bg text-text">
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className={`flex flex-wrap items-center gap-2 ${containerClass}`}>
        <strong className="mr-auto text-sm">{outletName} <span className="text-muted">· {hotelName}</span></strong>
        <span className="hidden text-xs text-muted sm:inline">{fullName}</span><NotificationBell /><LiveBadge /><PwaInstallButton /><OutletSwitcher targets={targets} /><LogoutButton className="rounded-lg border border-border px-2 py-1 text-xs" />
      </div>
    </header>
    <main className={`${containerClass} py-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]`}>{children}</main>
    {tabs.length > 0 ? <nav aria-label="Personel bölümleri" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom,0px)]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}><div className={`flex justify-around ${containerClass}`}>{tabs.map((tab) => {
      const active = path === tab.path && search.get("sekme") === tab.query;
      return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-[48px] items-center justify-center px-3 py-3 text-xs font-medium touch-manipulation ${active ? "text-accent font-semibold" : "text-muted"}`}>{tab.label}</Link>;
    })}</div></nav> : null}
  </div>;
}
