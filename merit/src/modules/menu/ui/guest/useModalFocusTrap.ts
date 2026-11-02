"use client";

import { useEffect, useRef } from "react";

export function useModalFocusTrap({
  active = true,
  onClose,
  initialFocusRef,
  containerRef,
}: {
  active?: boolean;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    // Capture the trigger element that opened the modal so we restore focus on close
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      triggerRef.current = document.activeElement;
    }

    const doc = containerRef.current?.ownerDocument ?? document;

    const timer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        focusable[0]?.focus();
      }
    }, 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === "Tab" && containerRef.current) {
        const focusable = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && doc.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && doc.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    doc.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(timer);
      doc.removeEventListener("keydown", onKeyDown);
      // Restore focus to invoker
      if (triggerRef.current && typeof triggerRef.current.focus === "function") {
        triggerRef.current.focus();
      }
    };
  }, [active, onClose, initialFocusRef, containerRef]);
}
