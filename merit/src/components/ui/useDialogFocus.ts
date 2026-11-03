"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus handling shared by ReasonDialog and ConfirmSheet: moves focus in on mount, keeps
 * Tab inside the container, Escape cancels, focus returns to the opener on unmount.
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  onCancel: () => void,
  initialFocus: () => HTMLElement | null | undefined,
): void {
  const cancelRef = useRef(onCancel);
  const focusRef = useRef(initialFocus);
  useEffect(() => {
    cancelRef.current = onCancel;
    focusRef.current = initialFocus;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    focusRef.current()?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      const box = containerRef.current;
      if (!box) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelRef.current();
      } else if (e.key === "Tab") {
        const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = at === -1 ? 0 : (at + (e.shiftKey ? -1 : 1) + items.length) % items.length;
        e.preventDefault();
        items[next]?.focus();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        focusRef.current()?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      if (previous?.isConnected) previous.focus();
    };
  }, [containerRef]);
}
