"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { dropBackEntry, forgetBackEntry, isTopBackEntry, pushBackEntry } from "./backStack";

/**
 * A sheet or dialog that closes on the phone's back button instead of leaving the page (decision D6). While `open`,
 * one history entry belongs to it; "back" calls `onClose`, and a close by its own button steps back over the entry.
 * An `onClose` that answers `false` (or a promise of it: "unsaved input, stay") keeps the dialog: its entry is put
 * back.
 *
 * Returns `navigate(href)`: a link followed from inside the open dialog takes the dialog's entry over
 * (`router.replace`), so "back" from the new page lands on the page under the dialog, not on a dead step.
 */
export function useBackCloses(
  open: boolean,
  onClose: () => void | boolean | Promise<void | boolean>,
): (href: string) => void {
  const router = useRouter();
  const closeRef = useRef(onClose);
  const idRef = useRef<number | null>(null);
  const openRef = useRef(open);
  useEffect(() => {
    closeRef.current = onClose;
    openRef.current = open;
  });
  useEffect(() => {
    if (!open) return;
    const onBack = () => {
      idRef.current = null;
      void Promise.resolve(closeRef.current()).then((closed) => {
        // After the question's own sheet has given its entry back (its close runs in the same commit).
        if (closed === false) {
          setTimeout(() => {
            if (openRef.current && idRef.current === null) idRef.current = pushBackEntry(onBack);
          }, 0);
        }
      });
    };
    idRef.current = pushBackEntry(onBack);
    return () => {
      const id = idRef.current;
      idRef.current = null;
      if (id !== null) void dropBackEntry(id);
    };
  }, [open]);
  return useCallback(
    (href: string) => {
      const id = idRef.current;
      if (id !== null && isTopBackEntry(id)) {
        idRef.current = null;
        forgetBackEntry(id);
        router.replace(href);
      } else {
        router.push(href);
      }
    },
    [router],
  );
}
