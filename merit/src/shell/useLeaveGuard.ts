"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { dropBackEntry, historyBack, pushBackEntry } from "./backStack";
import { confirm } from "./confirm";

export type LeaveGuard = {
  /** Asks before leaving while there is unsaved input; true = the page may be left (the guard is off then). */
  leave(): Promise<boolean>;
  /** Turns the guard off without asking (after a save), before the page navigates itself. */
  release(): Promise<void>;
};

/** The question asked before unsaved input is dropped. */
export function askLeave(): Promise<boolean> {
  return confirm({
    title: "Kaydedilmemiş değişiklikler",
    message: "Kaydedilmemiş değişiklikler var. Çıkılsın mı?",
    danger: true,
    confirmLabel: "Çık",
    cancelLabel: "Vazgeç",
  });
}

/** While `dirty`, closing or reloading the tab asks the browser's own question. */
export function useBeforeUnload(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

type GuardRefs = {
  dirty: { current: boolean };
  entry: { current: number | null };
  released: { current: boolean };
};

/** Puts the guard's history entry up (once); stepping back over it asks, and "Vazgeç" puts it back. */
function armGuard(refs: GuardRefs): void {
  if (refs.entry.current !== null) return;
  refs.entry.current = pushBackEntry(() => {
    // The user stepped back over the guard: they are on the page's own entry now.
    refs.entry.current = null;
    void askLeave().then((ok) => {
      if (ok) {
        refs.released.current = true;
        void historyBack();
      } else {
        // After the question's own sheet has given its entry back.
        setTimeout(() => {
          if (refs.dirty.current && !refs.released.current) armGuard(refs);
        }, 0);
      }
    });
  });
}

/**
 * Unsaved input on a page (decision D4): while `dirty`, closing the tab asks the browser's own question and the
 * phone's / browser's back button asks `askLeave()` first (a history entry of its own catches it). The page's own
 * "Geri" passes the guard to BackLink, which calls `leave()`. After a save, `await release()` before navigating:
 * the entry is taken off again, so no dead "back" step is left behind.
 */
export function useLeaveGuard(dirty: boolean): LeaveGuard {
  const dirtyRef = useRef(dirty);
  const entryRef = useRef<number | null>(null);
  const releasedRef = useRef(false);
  const arm = useCallback(() => armGuard({ dirty: dirtyRef, entry: entryRef, released: releasedRef }), []);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (dirty) {
      releasedRef.current = false;
      arm();
      return;
    }
    const id = entryRef.current;
    entryRef.current = null;
    if (id !== null) void dropBackEntry(id);
  }, [dirty, arm]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (releasedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Leaving by any other way (a link, a redirect): the entry is only forgotten, never stepped over.
  useEffect(
    () => () => {
      const id = entryRef.current;
      entryRef.current = null;
      if (id !== null) void dropBackEntry(id);
    },
    [],
  );

  const release = useCallback(async () => {
    releasedRef.current = true;
    const id = entryRef.current;
    entryRef.current = null;
    if (id !== null) await dropBackEntry(id);
  }, []);

  const leave = useCallback(async () => {
    if (dirtyRef.current && !releasedRef.current && !(await askLeave())) return false;
    await release();
    return true;
  }, [release]);

  return useMemo(() => ({ leave, release }), [leave, release]);
}
