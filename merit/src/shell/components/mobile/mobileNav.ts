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

export const MOBILE_NAV_INITIAL: MobileNavState = { recents: [], open: null, overlay: null };

/** Pure transitions of the three Android buttons, the launcher icons, the shade and the overview. */
export function mobileNavReducer(state: MobileNavState, action: MobileNavAction): MobileNavState {
  switch (action.type) {
    case "launch":
      // Launching moves the app to the end: the overview lists the most recent app last (rightmost).
      return {
        recents: [...state.recents.filter((a) => a !== action.app), action.app],
        open: action.app,
        overlay: null,
      };
    case "home":
      return { ...state, open: null, overlay: null };
    case "back":
      // Android back: first the layer on top, then the app itself (it keeps running in recents).
      if (state.overlay) return { ...state, overlay: null };
      if (state.open) return { ...state, open: null };
      return state;
    case "shade":
      return { ...state, overlay: action.open ? "shade" : state.overlay === "shade" ? null : state.overlay };
    case "recents":
      return { ...state, overlay: state.overlay === "recents" ? null : "recents" };
    case "drawer":
      return { ...state, overlay: "drawer" };
    case "dismiss": {
      const recents = state.recents.filter((a) => a !== action.app);
      return {
        recents,
        open: state.open === action.app ? null : state.open,
        // An empty overview closes itself, as on the phone.
        overlay: state.overlay === "recents" && recents.length === 0 ? null : state.overlay,
      };
    }
    case "clear":
      return { recents: [], open: null, overlay: null };
  }
}

/** Layers the phone's back button has to peel off before it leaves the page (history entries). */
export function mobileNavDepth(state: Pick<MobileNavState, "open" | "overlay">): number {
  return (state.open ? 1 : 0) + (state.overlay ? 1 : 0);
}

/** The state limited to the apps that are installed right now (the Tanımlar switch removes one). */
export function installedOnly(state: MobileNavState, installed: readonly MobileAppId[]): MobileNavState {
  const recents = state.recents.filter((a) => installed.includes(a));
  if (recents.length === state.recents.length) return state;
  return { ...state, recents, open: state.open && recents.includes(state.open) ? state.open : null };
}
