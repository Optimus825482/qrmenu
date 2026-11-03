"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons/Icon";

export type MenuEntry =
  | { kind: "action"; label: string; shortcut?: string; onSelect(): void }
  | { kind: "check"; label: string; shortcut?: string; checked: boolean; onSelect(): void }
  | { kind: "radio"; label: string; shortcut?: string; checked: boolean; onSelect(): void };

export type MenuDef = { label: string; items: MenuEntry[] };

/** Dosya / Görünüm / Yardım. Oynat joins in with the replay tasks; there are no disabled placeholders. */
export function MenuBar({ menus }: { menus: MenuDef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const tops = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (open === null) return;
    barRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not(.rd-menu-top)')?.focus();
  }, [open]);

  const close = (focusTop: boolean) => {
    const i = open;
    setOpen(null);
    if (focusTop && i !== null) tops.current[i]?.focus();
  };

  const onTopKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = menus.length;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = (i + (e.key === "ArrowRight" ? 1 : n - 1)) % n;
      tops.current[next]?.focus();
      if (open !== null) setOpen(next);
    } else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(i);
    } else if (e.key === "Escape") close(true);
  };

  const onItemKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const items = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const at = items.indexOf(e.currentTarget);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(at + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(at + items.length - 1) % items.length]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = (i + (e.key === "ArrowRight" ? 1 : menus.length - 1)) % menus.length;
      setOpen(next);
      tops.current[next]?.focus();
    } else if (e.key === "Tab") setOpen(null);
  };

  return (
    <div className="rd-menubar" role="menubar" aria-label="Radar menüsü" ref={barRef}>
      {menus.map((menu, i) => (
        <div className="rd-menu" key={menu.label}>
          <button
            type="button"
            role="menuitem"
            className="rd-menu-top"
            aria-haspopup="menu"
            aria-expanded={open === i}
            ref={(el) => {
              tops.current[i] = el;
            }}
            onClick={() => setOpen(open === i ? null : i)}
            onKeyDown={(e) => onTopKey(e, i)}
          >
            {menu.label}
          </button>
          {open === i ? (
            <div className="rd-menu-list" role="menu" aria-label={menu.label}>
              {menu.items.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className="rd-menu-item"
                  role={item.kind === "action" ? "menuitem" : item.kind === "check" ? "menuitemcheckbox" : "menuitemradio"}
                  {...(item.kind !== "action" ? { "aria-checked": item.checked } : {})}
                  onKeyDown={(e) => onItemKey(e, i)}
                  onClick={() => {
                    item.onSelect();
                    close(true);
                  }}
                >
                  <span>
                    {item.kind !== "action" && item.checked ? <Icon name="check" size={12} /> : null} {item.label}
                  </span>
                  {item.shortcut ? <span className="rd-menu-key">{item.shortcut}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
