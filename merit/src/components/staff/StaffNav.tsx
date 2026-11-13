"use client";

import { NavClock } from "./NavClock";
import Link from "next/link";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons/Icon";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { useBackCloses } from "@/shell/useBackCloses";
import { isNavActive, type NavModel } from "./navModel";

/**
 * Sayfadaki TEK `<nav>`: altta 80 px Material 3 çubuğu (ya da `layout="rail"` / geniş ekranda sol ray).
 * Alt çubukta "Daha" düğmesi kalan yetkili ekranları bir alt sayfada listeler (tam sayfa gezinme: layout,
 * yeni bağlamın gezinmesiyle yeniden kurulsun). Sol menüde (`side`) yer vardır: "Daha" yoktur, bütün ekranlar
 * doğrudan listelenir ve en üstte `tools` (bildirim zili, profil) durur.
 */
export function StaffNav({
  nav,
  pathname,
  sekme,
  side = false,
  tools,
}: {
  nav: NavModel;
  pathname: string;
  sekme: string | null;
  side?: boolean;
  tools?: ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  if (nav.primary.length === 0) return null;
  const moreActive = nav.more.some((item) => isNavActive(item, pathname, sekme));
  const entries = side ? [...nav.primary.filter((item) => item.id !== "more"), ...nav.more] : nav.primary;
  const fromMore = new Set(side ? nav.more.map((item) => item.id) : []);
  return (
    <>
      <nav aria-label="Ana gezinme" className="staff-nav" data-side={side ? "true" : undefined}>
        {side && tools ? <div className="staff-nav-tools">{tools}</div> : null}
        {entries.map((item) => {
          if (item.id === "more") {
            return (
              <button
                key="more"
                type="button"
                className="staff-nav-item"
                data-active={moreActive ? "true" : undefined}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(true)}
              >
                <span className="staff-nav-icon">
                  <Icon name="menu" size={24} />
                </span>
                <span className="staff-nav-label">Daha</span>
              </button>
            );
          }
          const active = isNavActive(item, pathname, sekme);
          const body = (
            <>
              <span className="staff-nav-icon">
                <Icon name={item.icon} size={24} />
              </span>
              <span className="staff-nav-label">{item.label}</span>
              {item.badge ? (
                <span className="staff-badge staff-nav-badge" data-testid="nav-badge" aria-label={`${item.badge} açık talep`}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </>
          );
          // Screens of the "Daha" list are plain anchors on purpose: the shell layout is rebuilt for the target page.
          if (fromMore.has(item.id)) {
            return (
              <a key={item.href || item.id} href={item.href} className="staff-nav-item" aria-current={active ? "page" : undefined}>
                {body}
              </a>
            );
          }
          return (
            <Link
              key={item.href || item.id}
              href={item.href}
              className="staff-nav-item"
              data-emphasis={item.emphasis}
              aria-current={active ? "page" : undefined}
            >
              {body}
            </Link>
          );
        })}
        {side ? <NavClock /> : null}
      </nav>
      {moreOpen ? <MoreSheet nav={nav} pathname={pathname} sekme={sekme} onClose={() => setMoreOpen(false)} /> : null}
    </>
  );
}

function MoreSheet({ nav, pathname, sekme, onClose }: { nav: NavModel; pathname: string; sekme: string | null; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(box, onClose, () => closeRef.current);
  // The phone's back button closes the sheet (D6); a screen picked here takes the sheet's history entry over.
  useBackCloses(true, onClose);
  const open = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.location.replace(href);
  };
  return (
    <div className="staff-sheet-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Daha" className="staff-sheet">
        <h2>Daha</h2>
        {nav.more.length === 0 ? <p className="text-muted">Başka ekran yok.</p> : null}
        <ul className="staff-sheet-list">
          {nav.more.map((item) => (
            <li key={item.href || item.id}>
              {/* A plain anchor on purpose: the shell layout is rebuilt for the target page. */}
              <a href={item.href} onClick={(event) => open(event, item.href)} className="staff-menu-item" data-current={isNavActive(item, pathname, sekme) ? "true" : undefined}>
                <Icon name={item.icon} size={24} />
                {item.label}
                {item.badge ? <span className="staff-badge staff-sheet-badge" aria-label={`${item.badge} açık talep`}>{item.badge}</span> : null}
              </a>
            </li>
          ))}
        </ul>
        <button ref={closeRef} type="button" className="staff-menu-item" style={{ marginTop: "var(--space-2)", justifyContent: "center", border: "1px solid var(--border)" }} onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}
