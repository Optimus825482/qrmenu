/** Shell data shapes shared by the client store and the server prefs action. */

export const WALLPAPERS = ["bliss", "klasik", "royal-gold", "gumus"] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];

export const WALLPAPER_LABELS: Record<Wallpaper, string> = {
  bliss: "Bliss",
  klasik: "Klasik",
  "royal-gold": "Royal Gold",
  gumus: "Gümüş",
};

/** Base text size of the shell (`--xp-font-size`). */
export const FONT_SCALES = ["S", "M", "L", "XL"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

/** Shell typeface (`--xp-font-family`). */
export const FONT_FAMILIES = ["tahoma", "segoe", "verdana", "arial", "system"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

/** Color scheme of title bars, taskbar and Start menu (theme.css: `[data-theme="…"]`). */
export const THEMES = ["luna", "zeytin", "gumus", "royal"] as const;
export type Theme = (typeof THEMES)[number];

/** The appearance fields of ShellPrefs. They may change in the mobile shell too. */
export type Appearance = {
  wallpaper: Wallpaper;
  fontScale: FontScale;
  fontFamily: FontFamily;
  theme: Theme;
};

/** "Varsayılana dön", and what a record saved before these fields existed falls back to. */
export const DEFAULT_APPEARANCE: Appearance = {
  wallpaper: "bliss",
  fontScale: "M",
  fontFamily: "tahoma",
  theme: "luna",
};

export type Rect = { x: number; y: number; w: number; h: number };

export type WinState = {
  id: string;
  appId: string;
  hotelId?: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  maximized: boolean;
  /** Geometry before maximizing, restored by the next toggleMaximize(). */
  prev?: Rect;
  z: number;
};

export type IconPos = { appId: string; x: number; y: number };

/** What is persisted per user in `User.prefs.shell` (and cached in localStorage). */
export type ShellPrefs = Appearance & { icons: IconPos[]; windows: WinState[] };

export type HotelRef = { id: string; name: string };

/** At most this many windows are open (and persisted) at once. */
export const MAX_WINDOWS = 30;
