"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { LiveBadge } from "./LiveBadge";
import { OutletSwitcher, type OutletTarget } from "./OutletSwitcher";
import { NotificationBell } from "@/shell/components/NotificationBell";

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

export function OpsShell({ children, outletName, hotelName, fullName, targets }: { children: React.ReactNode; outletName: string; hotelName: string; fullName: string; targets: OutletTarget[] }) {
  const path = usePathname();
  const search = useSearchParams();
  const tabs = path.startsWith("/kasa") ? cashierTabs : path.startsWith("/kds") ? [] : waiterTabs;
  return <div className="min-h-dvh bg-bg text-text">
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <strong className="mr-auto text-sm">{outletName} <span className="text-muted">· {hotelName}</span></strong>
        <span className="hidden text-xs text-muted sm:inline">{fullName}</span><NotificationBell /><LiveBadge /><OutletSwitcher targets={targets} /><LogoutButton className="rounded-lg border border-border px-2 py-1 text-xs" />
      </div>
    </header>
    <main className="mx-auto max-w-5xl p-4 pb-20">{children}</main>
    {tabs.length > 0 ? <nav aria-label="Personel bölümleri" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface"><div className="mx-auto flex max-w-5xl justify-around">{tabs.map((tab) => {
      const active = path === tab.path && search.get("sekme") === tab.query;
      return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`min-h-12 px-3 py-3 text-xs font-medium ${active ? "text-accent" : "text-muted"}`}>{tab.label}</Link>;
    })}</div></nav> : null}
  </div>;
}
