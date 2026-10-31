"use client";

import { useLayoutEffect, useRef } from "react";
import { confirmStore } from "./confirm";
import { saveShellPrefs } from "./prefsAction";
import { buildPersistSnapshot, type RestoredLayout } from "./persistSnapshot";
import { parseShellPrefs } from "./prefsSchema";
import { DEFAULT_APPEARANCE, type HotelRef, type ShellPrefs } from "./types";
import { currentShellMode, type ShellMode } from "./useShellMode";
import { effectiveViewport, gridPosition, windowStore } from "./windowStore";

const SAVE_DEBOUNCE_MS = 1000;

const layoutOf = (p: ShellPrefs): RestoredLayout => ({ windows: p.windows, icons: p.icons });

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
  /** Screen codes visible per hotel (windows bound to a hotel are limited by it). */
  screensByHotel: Record<string, string[]>;
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
  screensByHotel,
  serverPrefs,
  confirmSimpleActions,
}: Options): void {
  useLayoutEffect(() => {
    confirmStore.setState({ confirmSimpleActions });
  }, [confirmSimpleActions]);

  useLayoutEffect(() => {
    windowStore.getState().configure({ hotels, appIds, screensByHotel });
  }, [hotels, appIds, screensByHotel]);

  // Read once per mount: a router.refresh() must not overwrite the live layout with server props.
  const initial = useRef({ serverPrefs, appIds });

  useLayoutEffect(() => {
    const store = windowStore.getState();
    // useShellMode() still says 'desktop' while hydrating, so read the real mode from the window.
    // In mobile mode the phone size must not reach the store: it would clamp the desktop layout.
    let mode: ShellMode = currentShellMode();
    if (mode === "desktop") store.setViewport(window.innerWidth, window.innerHeight);

    const local = readLocal(userId);
    const { serverPrefs: fromServer, appIds: visible } = initial.current;
    const fallback: ShellPrefs = {
      ...DEFAULT_APPEARANCE,
      icons: visible.map((appId, i) => ({ appId, ...gridPosition(i, effectiveViewport({ viewport: store.viewport, footerBand: DEFAULT_APPEARANCE.footerBand })) })),
      windows: [],
    };
    const chosen = local?.pending ? local.prefs : (fromServer ?? local?.prefs ?? fallback);
    store.restore(chosen);

    // Desktop layout as restored (and kept current while on the desktop). While the mobile shell is
    // showing, saves send exactly this and only the appearance (wallpaper, font, theme, brand switches) may change.
    let layout: RestoredLayout =
      mode === "mobile"
        ? { windows: chosen.windows, icons: chosen.icons }
        : layoutOf(windowStore.getState().snapshot());
    const persistSnapshot = (): ShellPrefs =>
      buildPersistSnapshot(mode, layout, windowStore.getState().snapshot());

    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = JSON.stringify(persistSnapshot());

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const snap = persistSnapshot();
      const json = JSON.stringify(snap);
      saveShellPrefs(snap)
        .then((result) => {
          // Only a save of the current layout clears the pending mark.
          if (result.ok && JSON.stringify(persistSnapshot()) === json) {
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
      if (mode === "desktop") layout = layoutOf(state.snapshot());
      const snap = buildPersistSnapshot(mode, layout, state.snapshot());
      const json = JSON.stringify(snap);
      if (json === last) return;
      last = json;
      writeLocal(userId, { prefs: snap, pending: true });
      schedule();
    });
    if (local?.pending) schedule();

    // Mode changes (resize across 760 px, ?mobil=1 via history) are handled here, not through the
    // effect deps: re-running the effect would restore the layout again on every such change.
    const onResize = () => {
      mode = currentShellMode();
      if (mode !== "desktop") return;
      // Also covers mobile -> desktop: clamping resumes against the real size.
      const store = windowStore.getState();
      store.setViewport(window.innerWidth, window.innerHeight);
      layout = layoutOf(windowStore.getState().snapshot());
    };
    const onLeave = () => {
      if (timer) flush();
    };
    // Hidden tabs may be discarded without beforeunload (mobile, tab close): save early too.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onLeave();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("popstate", onResize);
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onResize);
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) flush();
    };
  }, [userId]);
}
