"use client";

import { useLayoutEffect, useRef } from "react";
import { confirmStore } from "./confirm";
import { saveShellPrefs } from "./prefsAction";
import { parseShellPrefs } from "./prefsSchema";
import type { HotelRef, ShellPrefs } from "./types";
import { gridPosition, windowStore } from "./windowStore";

const SAVE_DEBOUNCE_MS = 1000;

/** localStorage cache. `pending` = changed here but not yet confirmed saved on the server. */
type LocalEntry = { prefs: ShellPrefs; pending: boolean };

const localKey = (userId: string) => `merit.shell.${userId}`;

function readLocal(userId: string): LocalEntry | null {
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<LocalEntry>;
    const prefs = parseShellPrefs(entry.prefs);
    return prefs ? { prefs, pending: entry.pending === true } : null;
  } catch {
    return null; // storage blocked or corrupt: the server copy decides
  }
}

function writeLocal(userId: string, entry: LocalEntry): void {
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(entry));
  } catch {
    // storage full or blocked: the server copy still works
  }
}

type Options = {
  userId: string;
  hotels: HotelRef[];
  /** Ids of the apps the user may see, in display order. */
  appIds: string[];
  serverPrefs: ShellPrefs | null;
  confirmSimpleActions: boolean;
};

/**
 * Connects the shell store to the page: scope (hotels, visible apps), viewport, the confirm
 * policy, and persistence. On mount the layout is restored from the server prefs, unless this
 * browser holds newer unsaved changes (then those win and are pushed); with neither, every visible
 * app gets a desktop icon. Changes are saved through saveShellPrefs debounced by 1 s, written to
 * localStorage at once, and flushed on `beforeunload` / when the tab is hidden.
 */
export function useShellPersistence({
  userId,
  hotels,
  appIds,
  serverPrefs,
  confirmSimpleActions,
}: Options): void {
  useLayoutEffect(() => {
    confirmStore.setState({ confirmSimpleActions });
  }, [confirmSimpleActions]);

  useLayoutEffect(() => {
    windowStore.getState().configure({ hotels, appIds });
  }, [hotels, appIds]);

  // Read once per mount: a router.refresh() must not overwrite the live layout with server props.
  const initial = useRef({ serverPrefs, appIds });

  useLayoutEffect(() => {
    const store = windowStore.getState();
    store.setViewport(window.innerWidth, window.innerHeight);

    const local = readLocal(userId);
    const { serverPrefs: fromServer, appIds: visible } = initial.current;
    const fallback: ShellPrefs = {
      wallpaper: "bliss",
      icons: visible.map((appId, i) => ({ appId, ...gridPosition(i, store.viewport) })),
      windows: [],
    };
    store.restore(local?.pending ? local.prefs : (fromServer ?? local?.prefs ?? fallback));

    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = JSON.stringify(windowStore.getState().snapshot());

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const snap = windowStore.getState().snapshot();
      const json = JSON.stringify(snap);
      saveShellPrefs(snap)
        .then((result) => {
          // Only a save of the current layout clears the pending mark.
          if (result.ok && JSON.stringify(windowStore.getState().snapshot()) === json) {
            writeLocal(userId, { prefs: snap, pending: false });
          }
        })
        .catch(() => {
          // offline or unloading: the pending local copy is pushed on the next visit
        });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    };

    const unsubscribe = windowStore.subscribe((state) => {
      const snap = state.snapshot();
      const json = JSON.stringify(snap);
      if (json === last) return;
      last = json;
      writeLocal(userId, { prefs: snap, pending: true });
      schedule();
    });
    if (local?.pending) schedule();

    const onResize = () =>
      windowStore.getState().setViewport(window.innerWidth, window.innerHeight);
    const onLeave = () => {
      if (timer) flush();
    };
    // Hidden tabs may be discarded without beforeunload (mobile, tab close): save early too.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onLeave();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) flush();
    };
  }, [userId]);
}
