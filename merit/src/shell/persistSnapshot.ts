import type { ShellMode } from "./useShellMode";
import type { ShellPrefs } from "./types";

/** The window/icon layout of the desktop as it was restored (or last seen on the desktop). */
export type RestoredLayout = Pick<ShellPrefs, "windows" | "icons">;

/**
 * What the shell persists. On the desktop: the whole current state. In mobile mode the desktop
 * layout is not shown or editable, so `windows`/`icons` stay exactly as restored and only the
 * appearance (wallpaper, font, theme) follows the current state.
 */
export function buildPersistSnapshot(
  mode: ShellMode,
  restored: RestoredLayout,
  state: ShellPrefs,
): ShellPrefs {
  if (mode === "desktop") return state;
  return { ...state, windows: restored.windows, icons: restored.icons };
}
