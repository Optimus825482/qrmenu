/** A built-in mobile app ("izleme") or a registered desktop app ("core.radar"). */
export type MobileAppId = string;

/** A layer drawn over the home screen or the open app. */
export type MobileOverlay = "shade" | "recents" | "drawer" | null;

/**
 * Navigation state of the Android shell. `recents` holds every running app, oldest first; `open` is
 * the one on screen (null = home screen). An overlay sits on top of either.
 */
export type MobileNavState = {
  recents: MobileAppId[];
  open: MobileAppId | null;
  overlay: MobileOverlay;
  /**
   * Screens the user came through to reach `open`, oldest first (a folder, then the screen opened from
   * it): "back" returns to the last of them instead of dropping to the home screen. Absent = empty.
   */
  trail?: MobileAppId[];
};

export type MobileNavAction =
  | { type: "launch"; app: MobileAppId }
  | { type: "home" }
  | { type: "back" }
  | { type: "shade"; open: boolean }
  | { type: "recents" }
  | { type: "drawer" }
  | { type: "dismiss"; app: MobileAppId }
  | { type: "clear" };

export const MOBILE_NAV_INITIAL: MobileNavState = { recents: [], open: null, overlay: null, trail: [] };

/** Pure transitions of the three Android buttons, the launcher icons, the shade and the overview. */
export function mobileNavReducer(state: MobileNavState, action: MobileNavAction): MobileNavState {
  switch (action.type) {
    case "launch": {
      // Opened from inside another screen (a folder, a shortcut in an app): that screen is where "back"
      // leads. Opened from the home screen or from an overlay (drawer, overview): a fresh start.
      const from = state.open && !state.overlay && state.open !== action.app ? state.open : null;
      const trail = from ? [...trailOf(state).filter((a) => a !== action.app && a !== from), from] : [];
      // Launching moves the app to the end: the overview lists the most recent app last (rightmost).
      return {
        recents: [...state.recents.filter((a) => a !== action.app), action.app],
        open: action.app,
        overlay: null,
        trail,
      };
    }
    case "home":
      return { ...state, open: null, overlay: null, trail: [] };
    case "back": {
      // Android back: first the layer on top, then the screen the user came from, then the home screen
      // (the app keeps running in recents).
      if (state.overlay) return { ...state, overlay: null };
      if (!state.open) return state;
      const trail = trailOf(state);
      if (trail.length > 0) return { ...state, open: trail[trail.length - 1], trail: trail.slice(0, -1) };
      return { ...state, open: null, trail: [] };
    }
    case "shade":
      return { ...state, overlay: action.open ? "shade" : state.overlay === "shade" ? null : state.overlay };
    case "recents":
      return { ...state, overlay: state.overlay === "recents" ? null : "recents" };
    case "drawer":
      return { ...state, overlay: "drawer" };
    case "dismiss": {
      const recents = state.recents.filter((a) => a !== action.app);
      const closing = state.open === action.app;
      return {
        recents,
        open: closing ? null : state.open,
        trail: closing ? [] : trailOf(state).filter((a) => a !== action.app),
        // An empty overview closes itself, as on the phone.
        overlay: state.overlay === "recents" && recents.length === 0 ? null : state.overlay,
      };
    }
    case "clear":
      return { recents: [], open: null, overlay: null, trail: [] };
  }
}

/** Layers the phone's back button has to peel off before it leaves the page (history entries). */
export function mobileNavDepth(state: Pick<MobileNavState, "open" | "overlay" | "trail">): number {
  return (state.open ? 1 + (state.trail?.length ?? 0) : 0) + (state.overlay ? 1 : 0);
}

const trailOf = (state: MobileNavState): MobileAppId[] => state.trail ?? [];

/** The state limited to the apps that are installed right now (the Tanımlar switch removes one). */
export function installedOnly(state: MobileNavState, installed: readonly MobileAppId[]): MobileNavState {
  const recents = state.recents.filter((a) => installed.includes(a));
  if (recents.length === state.recents.length) return state;
  const open = state.open && recents.includes(state.open) ? state.open : null;
  return { ...state, recents, open, trail: open ? trailOf(state).filter((a) => recents.includes(a)) : [] };
}
