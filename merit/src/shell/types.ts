/** Shell data shapes shared by the client store and the server prefs action. */

/** `ozel` = a flat color chosen by the user (`wallpaperColor`). */
export const WALLPAPERS = ["bliss", "klasik", "royal-gold", "gumus", "ozel"] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];

export const WALLPAPER_LABELS: Record<Wallpaper, string> = {
  bliss: "Bliss",
  klasik: "Klasik",
  "royal-gold": "Royal Gold",
  gumus: "Gümüş",
  ozel: "Düz renk",
};

/** `#rrggbb`, the only color syntax accepted for the custom wallpaper. */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Base text size of the shell (`--xp-font-size`). */
export const FONT_SCALES = ["S", "M", "L", "XL", "XXL", "XXXL"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

/** Shell typeface (`--xp-font-family`). */
export const FONT_FAMILIES = ["tahoma", "segoe", "verdana", "arial", "system", "microsoftSans", "robotoMedium"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

/** Color scheme of title bars, taskbar and Start menu (theme.css: `[data-theme="…"]`). */
export const THEMES = ["luna", "zeytin", "gumus", "royal"] as const;
export type Theme = (typeof THEMES)[number];

/** The appearance fields of ShellPrefs. They may change in the mobile shell too. */
export type Appearance = {
  wallpaper: Wallpaper;
  /** Color of the `ozel` wallpaper. */
  wallpaperColor: string;
  fontScale: FontScale;
  fontFamily: FontFamily;
  theme: Theme;
  /** Sticky copyright band below the taskbar (desktop shell only). */
  footerBand: boolean;
  /** Brand mark drawn on the wallpaper (desktop shell only). */
  brandWatermark: boolean;
};

/** "Varsayılana dön", and what a record saved before these fields existed falls back to. */
export const DEFAULT_APPEARANCE: Appearance = {
  wallpaper: "bliss",
  wallpaperColor: "#3a6ea5",
  fontScale: "M",
  fontFamily: "tahoma",
  theme: "luna",
  footerBand: true,
  brandWatermark: true,
};

export type Rect = { x: number; y: number; w: number; h: number };

export type WinState = {
  id: string;
  appId: string;
  hotelId?: string;
  /** Opening request for the app (`AppProps.initialPanel`); transient, dropped by `snapshot()`. */
  initialPanel?: string;
  /** Opening request for a preselected outlet; transient, dropped by snapshot(). */
  initialOutletId?: string;
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
export type ShellPrefs = Appearance & {
  icons: IconPos[];
  windows: WinState[];
  shortcutVersion?: number;
  /** Kullanıcının tercih ettiği kabuk (yalnız rolüne izin verilenler arasından uygulanır, spec 4.1). */
  preferredShell?: "xp" | "personel" | "pos";
};

export type HotelRef = { id: string; name: string };

/** At most this many windows are open (and persisted) at once. */
export const MAX_WINDOWS = 30;
