"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

export type MenuItem =
  | { kind: "separator" }
  | {
      kind?: "item";
      label: string;
      onSelect?: () => void;
      submenu?: MenuItem[];
      /** Radio item (role=menuitemradio) when defined. */
      checked?: boolean;
      disabled?: boolean;
    };

type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  /** Accessible name of the menu ("Masaüstü menüsü"). */
  label: string;
  onClose(): void;
  /** Element that opened the menu: pointer-downs on it are not "outside" (toggle buttons). */
  anchorRef?: RefObject<HTMLElement | null>;
};

/**
 * XP context / drop-down menu, rendered at viewport coordinates. Keyboard: arrows move, Enter or
 * Space selects, → opens and ← closes a submenu, Esc closes. A pointer-down outside closes it.
 */
export function ContextMenu({ x, y, items, label, onClose, anchorRef }: Props) {
  // Latest callbacks without re-running the mount effect (callers may pass inline functions).
  const latest = useRef({ onClose, anchorRef });
  useLayoutEffect(() => {
    latest.current = { onClose, anchorRef };
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const close = () => latest.current.onClose();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if ((target as Element).closest?.(".xp-menu")) return;
      if (latest.current.anchorRef?.current?.contains(target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", close);
      // Give focus back to where it was, unless something else (a dialog) has taken it since.
      const active = document.activeElement;
      const focusLost = !active || active === document.body || active.closest(".xp-menu");
      if (previous?.isConnected && focusLost) {
        previous.focus();
      }
    };
  }, []);

  const done = () => latest.current.onClose();
  return <MenuList x={x} y={y} items={items} label={label} onDone={done} onBack={done} root />;
}

type ListProps = {
  x: number;
  y: number;
  /** Submenus: right edge to align to when there is no room on the right (flip to the left). */
  flipRight?: number;
  items: MenuItem[];
  label: string;
  /** Closes the whole menu tree (after a selection or Esc on the root). */
  onDone(): void;
  /** Closes only this level (← or Esc in a submenu). */
  onBack(): void;
  root?: boolean;
};

function MenuList({ x, y, flipRight, items, label, onDone, onBack, root = false }: ListProps) {
  const ref = useRef<HTMLUListElement>(null);
  const [openSub, setOpenSub] = useState<{
    index: number;
    x: number;
    y: number;
    flipRight: number;
  } | null>(null);

  // Keep the menu on screen and focus its first item. Positioned directly on the element: the
  // size is only known after layout, and a second render would flash.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = x + width > window.innerWidth && flipRight !== undefined ? flipRight - width : x;
    el.style.left = `${Math.max(0, Math.min(left, window.innerWidth - width))}px`;
    el.style.top = `${Math.max(0, Math.min(y, window.innerHeight - height))}px`;
    menuItems(el)[0]?.focus();
  }, [x, y, flipRight]);

  const openSubmenu = (index: number, button: HTMLElement) => {
    const r = button.getBoundingClientRect();
    setOpenSub({ index, x: r.right - 2, y: r.top - 3, flipRight: r.left + 2 });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const list = ref.current;
    // Keys pressed inside an open submenu bubble up through this list: they are not ours.
    if (!list || (e.target as Element).closest(".xp-menu") !== list) return;
    const all = menuItems(list);
    const current = all.indexOf(document.activeElement as HTMLElement);
    if (current === -1 && !["Escape", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        all[(current + step + all.length) % all.length]?.focus();
        break;
      }
      case "ArrowRight": {
        const button = all[current];
        const index = Number(button?.dataset.index);
        const item = items[index];
        if (item && item.kind !== "separator" && item.submenu) {
          e.preventDefault();
          openSubmenu(index, button);
        }
        break;
      }
      case "ArrowLeft":
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape" || !root) onBack();
        break;
      case "Tab":
        e.preventDefault();
        onDone();
        break;
    }
  };

  return (
    <ul
      ref={ref}
      role="menu"
      aria-label={label}
      className="xp-menu"
      style={{ left: x, top: y }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        if (item.kind === "separator") {
          return <li key={`sep-${index}`} role="separator" className="xp-menu-separator" />;
        }
        const hasSub = Boolean(item.submenu);
        const isRadio = item.checked !== undefined;
        const expanded = openSub?.index === index;
        return (
          <li key={item.label} role="none">
            <button
              type="button"
              role={isRadio ? "menuitemradio" : "menuitem"}
              aria-checked={isRadio ? item.checked : undefined}
              aria-haspopup={hasSub ? "menu" : undefined}
              aria-expanded={hasSub ? expanded : undefined}
              aria-disabled={item.disabled || undefined}
              data-index={index}
              tabIndex={-1}
              className="xp-menu-item"
              onPointerEnter={(e) => {
                if (hasSub) openSubmenu(index, e.currentTarget);
                else if (openSub) setOpenSub(null);
              }}
              onClick={(e) => {
                if (item.disabled) return;
                if (hasSub) {
                  openSubmenu(index, e.currentTarget);
                  return;
                }
                onDone();
                item.onSelect?.();
              }}
            >
              <span className="xp-menu-check" aria-hidden="true">
                {item.checked ? "●" : ""}
              </span>
              {item.label}
              {hasSub ? (
                <span className="xp-menu-arrow" aria-hidden="true">
                  ▸
                </span>
              ) : null}
            </button>
            {expanded && item.submenu ? (
              <MenuList
                x={openSub.x}
                y={openSub.y}
                flipRight={openSub.flipRight}
                items={item.submenu}
                label={item.label}
                onDone={onDone}
                onBack={() => {
                  setOpenSub(null);
                  menuItems(ref.current!)[index]?.focus();
                }}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The focusable items of one menu level (not those of an open submenu). */
function menuItems(list: HTMLUListElement): HTMLElement[] {
  return [...list.children]
    .map((li) => li.firstElementChild)
    .filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches('[role^="menuitem"]'));
}
