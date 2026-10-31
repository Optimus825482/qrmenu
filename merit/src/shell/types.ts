/** Shell data shapes shared by the client store and the server prefs action. */

export const WALLPAPERS = ["bliss", "klasik", "royal-gold", "gumus"] as const;
export type Wallpaper = (typeof WALLPAPERS)[number];

export const WALLPAPER_LABELS: Record<Wallpaper, string> = {
  bliss: "Bliss",
  klasik: "Klasik",
  "royal-gold": "Royal Gold",
  gumus: "Gümüş",
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
export type ShellPrefs = { wallpaper: Wallpaper; icons: IconPos[]; windows: WinState[] };

export type HotelRef = { id: string; name: string };

/** At most this many windows are open (and persisted) at once. */
export const MAX_WINDOWS = 30;
