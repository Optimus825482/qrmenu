"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { isNavActive, type NavModel } from "./navModel";

/**
 * Sayfadaki TEK `<nav>`: altta 80 px Material 3 çubuğu (ya da `layout="rail"` / geniş ekranda sol ray).
 * "Daha" düğmesi kalan yetkili ekranları bir alt sayfada listeler (tam sayfa gezinme: layout, yeni
 * bağlamın gezinmesiyle yeniden kurulsun).
 */
export function StaffNav({ nav, pathname, sekme }: { nav: NavModel; pathname: string; sekme: string | null }) {
  const [moreOpen, setMoreOpen] = useState(false);
  if (nav.primary.length === 0) return null;
  const moreActive = nav.more.some((item) => isNavActive(item, pathname, sekme));
  return (
    <>
      <nav aria-label="Ana gezinme" className="staff-nav">
        {nav.primary.map((item) => {
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
          return (
            <Link
              key={item.id}
              href={item.href}
              className="staff-nav-item"
              data-emphasis={item.emphasis}
              aria-current={active ? "page" : undefined}
            >
              <span className="staff-nav-icon">
                <Icon name={item.icon} size={24} />
              </span>
              <span className="staff-nav-label">{item.label}</span>
              {item.badge ? (
                <span className="staff-badge staff-nav-badge" data-testid="nav-badge" aria-label={`${item.badge} açık talep`}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {moreOpen ? <MoreSheet nav={nav} pathname={pathname} sekme={sekme} onClose={() => setMoreOpen(false)} /> : null}
    </>
  );
}

function MoreSheet({ nav, pathname, sekme, onClose }: { nav: NavModel; pathname: string; sekme: string | null; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(box, onClose, () => closeRef.current);
  return (
    <div className="staff-sheet-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label="Daha" className="staff-sheet">
        <h2>Daha</h2>
        {nav.more.length === 0 ? <p className="text-muted">Başka ekran yok.</p> : null}
        <ul className="staff-sheet-list">
          {nav.more.map((item) => (
            <li key={item.id}>
              {/* A plain anchor on purpose: the shell layout is rebuilt for the target page. */}
              <a href={item.href} className="staff-menu-item" data-current={isNavActive(item, pathname, sekme) ? "true" : undefined}>
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
