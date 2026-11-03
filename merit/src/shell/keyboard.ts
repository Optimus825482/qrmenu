"use client";

import { useEffect, useEffectEvent } from "react";
import { selectActiveId, windowStore } from "./windowStore";

type Command = () => void | boolean;
type Commands = Partial<Record<"save" | "remove" | "rename" | "find" | "refresh" | "escape" | "help", Command>>;

export function useWindowCommands(handlers: Commands, enabled = true): void {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey) return;
    const target = event.target instanceof Element ? event.target : null;
    const editable = target?.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])");
    if (target?.closest("#xp-start-menu, [role=menu], [role=alertdialog]")) return;
    const key = event.key.toLowerCase();
    let command: Command | undefined;
    if (event.ctrlKey || event.metaKey) {
      if (key === "s") command = handlers.save;
      if (key === "f") command = handlers.find;
    } else if (!target?.closest("[aria-modal=true]")) {
      if (key === "f1") command = handlers.help;
      if (key === "f5") command = handlers.refresh;
      if (key === "escape") command = handlers.escape;
      if (!editable && key === "delete") command = handlers.remove;
      if (!editable && key === "f2") command = handlers.rename;
    }
    if (!command) return;
    if (event.repeat || command() !== false) event.preventDefault();
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => handle(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** The window that Ctrl+Alt+Left/Right moves to (wraps around); undefined when fewer than two windows exist. */
export function adjacentWindow(order: string[], activeId: string | undefined, direction: 1 | -1): string | undefined {
  if (order.length < 2) return undefined;
  const index = activeId ? order.indexOf(activeId) : -1;
  if (index < 0) return order[direction === 1 ? 0 : order.length - 1];
  return order[(index + direction + order.length) % order.length];
}

/** First item of the active window's menu bar (F10 and a lone Alt press land here). */
function activeMenubarItem(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".xp-window.is-active:not([hidden]) .xp-menubar-item");
}

/**
 * Shell-wide keys: Ctrl+Alt+Left/Right switches windows, F10 or a single Alt press activates the
 * menu bar of the active window. A browser shortcut that already used the key is left alone.
 */
export function useShellShortcuts(): void {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey && event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const state = windowStore.getState();
      const next = adjacentWindow(state.order, selectActiveId(state), event.key === "ArrowRight" ? 1 : -1);
      if (!next) return;
      event.preventDefault();
      state.focus(next);
      requestAnimationFrame(() => document.getElementById(`xp-window-${next}`)?.focus());
      return;
    }
    if (event.key === "F10" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      const item = activeMenubarItem();
      if (!item) return;
      event.preventDefault();
      item.focus();
    }
  });

  useEffect(() => {
    let loneAlt = false;
    const onKeyDown = (event: KeyboardEvent) => {
      loneAlt = event.key === "Alt" && !event.repeat && !event.ctrlKey && !event.shiftKey;
      handle(event);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Alt" || !loneAlt) return;
      loneAlt = false;
      const item = activeMenubarItem();
      if (!item) return;
      event.preventDefault();
      item.focus();
    };
    const reset = () => {
      loneAlt = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", reset, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", reset, true);
    };
  }, []);
}
