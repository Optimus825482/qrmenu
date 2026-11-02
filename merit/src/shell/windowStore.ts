import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { getApp, type AppDefinition } from "./registry";
import {
  DEFAULT_APPEARANCE,
  FONT_FAMILIES,
  FONT_SCALES,
  HEX_COLOR,
  MAX_WINDOWS,
  THEMES,
  WALLPAPERS,
  type FontFamily,
  type FontScale,
  type HotelRef,
  type IconPos,
  type Rect,
  type ShellPrefs,
  type Theme,
  type Wallpaper,
  type WinState,
} from "./types";

/**
 * Window manager state of the XP shell. Pure (no DOM, no `window` access): the client feeds the
 * viewport size in through setViewport(), so the store runs unchanged under Vitest (node).
 */

export { MAX_WINDOWS, WALLPAPERS };
export type { FontFamily, FontScale, HotelRef, IconPos, Rect, ShellPrefs, Theme, Wallpaper, WinState };

export const Z_BASE = 300;
/**
 * z stays in [Z_BASE, Z_BASE + Z_SPAN): when focusing would pass it, every window is renumbered by
 * rank. Taskbar, Start menu and dialogs sit far above (theme.css: 100000+).
 */
export const Z_SPAN = 10_000;
export const MIN_W = 360;
export const MIN_H = 240;
export const TASKBAR_H = 30;
/**
 * Default height of the copyright band below the taskbar (theme.css: .xp-footer-band), when
 * enabled. The rendered band reports its real height (it adds the PWA safe-area inset) through
 * setFooterHeight().
 */
export const FOOTER_HEIGHT = 22;
/** Bounds for a measured footer height (px); anything else is ignored. */
const FOOTER_HEIGHT_MAX = 200;
export const CASCADE_STEP = 24;
export const CASCADE_ORIGIN = 32;
/** Desktop icon grid used by "Simgeleri hizala" and the default layout. */
export const ICON_CELL_W = 84;
export const ICON_CELL_H = 84;
export const ICON_MARGIN = 8;

type ShellState = {
  windows: Record<string, WinState>;
  /** Opening order: the taskbar order. */
  order: string[];
  nextZ: number;
  /** Next window id number (`w${seq}`). */
  seq: number;
  /** Cascade step of the most recently opened window. */
  cascade: number;
  viewport: { w: number; h: number };
  wallpaper: Wallpaper;
  wallpaperColor: string;
  fontScale: FontScale;
  fontFamily: FontFamily;
  theme: Theme;
  footerBand: boolean;
  /** Measured height of the footer band in px (not persisted); FOOTER_HEIGHT until reported. */
  footerHeight: number;
  brandWatermark: boolean;
  shortcutVersion: number;
  icons: IconPos[];
  /** Hotels in the user's scope (window context). */
  hotels: HotelRef[];
  /** Apps the user may see (union over their hotels); null = every registered app. */
  appIds: string[] | null;
  /**
   * Screen codes visible per hotel (visibleScreens(ctx, hotelId)); null = no per-hotel limit.
   * A window bound to a hotel needs its app's screen visible in that hotel.
   */
  screensByHotel: Record<string, string[]> | null;
  /** False until the first restore(): the client renders the desktop only after it. */
  ready: boolean;
};

type ShellActions = {
  configure(opts: {
    hotels?: HotelRef[];
    appIds?: string[] | null;
    screensByHotel?: Record<string, string[]> | null;
  }): void;
  setViewport(w: number, h: number): void;
  /**
   * New window id; null for an unknown / not-visible app, an app not visible in the requested
   * hotel, or when MAX_WINDOWS are open.
   */
  open(appId: string, opts?: { hotelId?: string; initialPanel?: string; initialOutletId?: string }): string | null;
  close(id: string): void;
  focus(id: string): void;
  minimize(id: string): void;
  toggleMaximize(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, w: number, h: number): void;
  setBounds(id: string, x: number, y: number, w: number, h: number): void;
  setHotel(id: string, hotelId: string): void;
  clearHotel(id: string): void;
  setWallpaper(wallpaper: Wallpaper): void;
  /** `#rrggbb` color of the "Düz renk" wallpaper; anything else is ignored. */
  setWallpaperColor(hex: string): void;
  setFontScale(scale: FontScale): void;
  setFontFamily(family: FontFamily): void;
  setTheme(theme: Theme): void;
  /** Shows/hides the footer band; the desktop area (and maximized windows) shrink with it. */
  setFooterBand(on: boolean): void;
  /** Real rendered height of the footer band (px), reported by FooterBand. */
  setFooterHeight(px: number): void;
  setBrandWatermark(on: boolean): void;
  setShortcutVersion(version: number): void;
  /** Wallpaper, font, theme and brand switches back to DEFAULT_APPEARANCE ("Varsayılana dön"). */
  resetAppearance(): void;
  addIcon(appId: string, x: number, y: number): void;
  moveIcon(appId: string, x: number, y: number): void;
  removeIcon(appId: string): void;
  setIcons(icons: IconPos[]): void;
  arrangeIcons(): void;
  snapshot(): ShellPrefs;
  restore(p: ShellPrefs): void;
};

export type WindowStore = ShellState & ShellActions;

/** `value` when it is one of `allowed`, else `fallback` (stored prefs are not trusted blindly). */
const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Height available to windows: the (effective) viewport minus the taskbar. */
export const deskHeight = (vp: { h: number }) => Math.max(0, vp.h - TASKBAR_H);

/**
 * The viewport as windows and icons see it: the browser viewport minus the footer band when it is
 * shown. Everything that positions or clamps goes through this, never through `viewport` directly.
 */
export function effectiveViewport(
  s: Pick<ShellState, "viewport" | "footerBand" | "footerHeight">,
): ShellState["viewport"] {
  return { w: s.viewport.w, h: Math.max(0, s.viewport.h - (s.footerBand ? s.footerHeight : 0)) };
}

export function minSize(app: AppDefinition | undefined): { w: number; h: number } {
  return { w: app?.window.minW ?? MIN_W, h: app?.window.minH ?? MIN_H };
}

/** Keeps a window fully inside the desktop (as far as its size allows); never negative. */
export function clampWindowPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  vp: ShellState["viewport"],
) {
  return {
    x: clamp(Math.round(x), 0, vp.w - w),
    y: clamp(Math.round(y), 0, deskHeight(vp) - h),
  };
}

function maximizedRect(vp: ShellState["viewport"]): Rect {
  return { x: 0, y: 0, w: vp.w, h: deskHeight(vp) };
}

/** Grid slot of the i-th icon, column by column (XP's auto-arrange). */
export function gridPosition(i: number, vp: ShellState["viewport"]): { x: number; y: number } {
  const rows = Math.max(1, Math.floor((deskHeight(vp) - ICON_MARGIN) / ICON_CELL_H));
  return {
    x: ICON_MARGIN + Math.floor(i / rows) * ICON_CELL_W,
    y: ICON_MARGIN + (i % rows) * ICON_CELL_H,
  };
}

function iconPosition(x: number, y: number, vp: ShellState["viewport"]) {
  return {
    x: clamp(Math.round(x), 0, vp.w - ICON_CELL_W),
    y: clamp(Math.round(y), 0, deskHeight(vp) - ICON_CELL_H),
  };
}

/** z = Z_BASE + rank by the current z (stable for ties by `order`); returns the next free z. */
function renumberZ(
  windows: Record<string, WinState>,
  order: string[],
): { windows: Record<string, WinState>; nextZ: number } {
  const ranked = order.filter((id) => windows[id]).sort((a, b) => windows[a].z - windows[b].z);
  const out: Record<string, WinState> = {};
  ranked.forEach((id, rank) => {
    out[id] = windows[id].z === Z_BASE + rank ? windows[id] : { ...windows[id], z: Z_BASE + rank };
  });
  return { windows: out, nextZ: Z_BASE + ranked.length };
}

/** Whether `app` may run in `hotelId`: the hotel is in scope and the app's screen visible there. */
export function appVisibleInHotel(
  s: Pick<ShellState, "hotels" | "screensByHotel">,
  app: Pick<AppDefinition, "screenCode">,
  hotelId: string,
): boolean {
  if (!s.hotels.some((h) => h.id === hotelId)) return false;
  return s.screensByHotel === null || (s.screensByHotel[hotelId] ?? []).includes(app.screenCode);
}

/** The hotels a window of `appId` may be bound to (the hotel picker's cards). */
export function hotelsForApp(
  s: Pick<ShellState, "hotels" | "screensByHotel">,
  appId: string,
): HotelRef[] {
  const app = getApp(appId);
  return app ? s.hotels.filter((h) => appVisibleInHotel(s, app, h.id)) : [];
}

/** The window with the highest z that is not minimized. */
export function selectActiveId(s: Pick<ShellState, "windows" | "order">): string | undefined {
  let best: WinState | undefined;
  for (const id of s.order) {
    const w = s.windows[id];
    if (w && !w.minimized && (!best || w.z > best.z)) best = w;
  }
  return best?.id;
}

export function createWindowStore() {
  return createStore<WindowStore>()((set, get) => {
    /** The app, when the user may see it at all and, with `hotelId`, in that hotel. */
    const allowed = (appId: string, hotelId?: string): AppDefinition | undefined => {
      const app = getApp(appId);
      const { appIds } = get();
      if (!app || (appIds !== null && !appIds.includes(appId))) return undefined;
      if (hotelId !== undefined && app.needsHotel && !appVisibleInHotel(get(), app, hotelId)) {
        return undefined;
      }
      return app;
    };

    /**
     * Hotel context for a window: a choice where the app is visible, the only such hotel, or none
     * (picker).
     */
    const resolveHotel = (app: AppDefinition, wanted?: string): string | undefined => {
      if (!app.needsHotel) return undefined;
      if (wanted && appVisibleInHotel(get(), app, wanted)) return wanted;
      const choices = hotelsForApp(get(), app.id);
      return choices.length === 1 ? choices[0].id : undefined;
    };

    const titleFor = (app: AppDefinition, hotelId?: string): string => {
      const hotel = hotelId ? get().hotels.find((h) => h.id === hotelId) : undefined;
      return hotel ? `${app.title} · ${hotel.name}` : app.title;
    };

    /** Renumbers z before the counter would leave its band (long sessions, many focus clicks). */
    const compactZ = () => {
      if (get().nextZ < Z_BASE + Z_SPAN) return;
      set(renumberZ(get().windows, get().order));
    };

    const update = (id: string, fn: (w: WinState) => WinState | undefined) => {
      const current = get().windows[id];
      if (!current) return;
      const next = fn(current);
      if (next && next !== current) set({ windows: { ...get().windows, [id]: next } });
    };

    /** Every window re-fitted to `vp` (maximized ones fill it, others are clamped into it). */
    const fitWindows = (vp: ShellState["viewport"]): Record<string, WinState> => {
      const windows: Record<string, WinState> = {};
      for (const [id, win] of Object.entries(get().windows)) {
        windows[id] = win.maximized
          ? { ...win, ...maximizedRect(vp) }
          : { ...win, ...clampWindowPosition(win.x, win.y, win.w, win.h, vp) };
      }
      return windows;
    };

    return {
      windows: {},
      order: [],
      nextZ: Z_BASE,
      seq: 1,
      cascade: 0,
      viewport: { w: 1920, h: 1080 },
      ...DEFAULT_APPEARANCE,
      footerHeight: FOOTER_HEIGHT,
      shortcutVersion: 0,
      icons: [],
      hotels: [],
      appIds: null,
      screensByHotel: null,
      ready: false,

      configure({ hotels, appIds, screensByHotel }) {
        set({
          ...(hotels !== undefined ? { hotels } : {}),
          ...(appIds !== undefined ? { appIds } : {}),
          ...(screensByHotel !== undefined ? { screensByHotel } : {}),
        });
      },

      setViewport(w, h) {
        const vp = { w: Math.max(0, Math.round(w)), h: Math.max(0, Math.round(h)) };
        const old = get().viewport;
        if (old.w === vp.w && old.h === vp.h) return;
        set({
          viewport: vp,
          windows: fitWindows(effectiveViewport({ ...get(), viewport: vp })),
        });
      },

      open(appId, opts = {}) {
        const app = allowed(appId, opts.hotelId);
        if (!app || get().order.length >= MAX_WINDOWS) return null;
        compactZ();
        const { order, cascade, seq, nextZ } = get();
        const vp = effectiveViewport(get());
        const w = Math.min(app.window.w, Math.max(minSize(app).w, vp.w));
        const h = Math.min(app.window.h, Math.max(minSize(app).h, deskHeight(vp)));
        let step = order.length === 0 ? 0 : cascade + 1;
        const at = (k: number) => CASCADE_ORIGIN + k * CASCADE_STEP;
        if (at(step) + w > vp.w || at(step) + h > deskHeight(vp)) step = 0;
        const hotelId = resolveHotel(app, opts.hotelId);
        const id = `w${seq}`;
        const win: WinState = {
          id,
          appId,
          hotelId,
          ...(opts.initialPanel !== undefined ? { initialPanel: opts.initialPanel } : {}),
          ...(opts.initialOutletId !== undefined ? { initialOutletId: opts.initialOutletId } : {}),
          title: titleFor(app, hotelId),
          ...clampWindowPosition(at(step), at(step), w, h, vp),
          w,
          h,
          minimized: false,
          maximized: false,
          z: nextZ,
        };
        set({
          windows: { ...get().windows, [id]: win },
          order: [...order, id],
          nextZ: nextZ + 1,
          seq: seq + 1,
          cascade: step,
        });
        return id;
      },

      close(id) {
        if (!get().windows[id]) return;
        const windows = { ...get().windows };
        delete windows[id];
        set({ windows, order: get().order.filter((o) => o !== id) });
      },

      focus(id) {
        if (!get().windows[id]) return;
        compactZ();
        const { nextZ } = get();
        update(id, (w) =>
          w.z === nextZ - 1 && !w.minimized ? w : { ...w, z: nextZ, minimized: false },
        );
        if (get().windows[id]?.z === nextZ) set({ nextZ: nextZ + 1 });
      },

      minimize(id) {
        update(id, (w) => (w.minimized ? w : { ...w, minimized: true }));
      },

      toggleMaximize(id) {
        const vp = effectiveViewport(get());
        update(id, (w) => {
          if (w.maximized) {
            const prev = w.prev ?? { x: w.x, y: w.y, w: w.w, h: w.h };
            return { ...w, ...prev, maximized: false, prev: undefined };
          }
          if (getApp(w.appId)?.window.resizable === false) return w;
          const prev = { x: w.x, y: w.y, w: w.w, h: w.h };
          return { ...w, prev, ...maximizedRect(vp), maximized: true };
        });
        get().focus(id);
      },

      move(id, x, y) {
        const vp = effectiveViewport(get());
        update(id, (w) => {
          if (w.maximized) return w;
          const pos = clampWindowPosition(x, y, w.w, w.h, vp);
          return pos.x === w.x && pos.y === w.y ? w : { ...w, ...pos };
        });
      },

      resize(id, width, height) {
        const vp = effectiveViewport(get());
        update(id, (w) => {
          const app = getApp(w.appId);
          if (w.maximized || app?.window.resizable === false) return w;
          const min = minSize(app);
          const nw = Math.max(min.w, Math.min(Math.round(width), vp.w - w.x));
          const nh = Math.max(min.h, Math.min(Math.round(height), deskHeight(vp) - w.y));
          return nw === w.w && nh === w.h ? w : { ...w, w: nw, h: nh };
        });
      },

      setBounds(id, x, y, width, height) {
        const vp = effectiveViewport(get());
        update(id, (w) => {
          const app = getApp(w.appId);
          if (w.maximized || app?.window.resizable === false) return w;
          const min = minSize(app);
          const nw = Math.max(min.w, Math.min(Math.round(width), vp.w));
          const nh = Math.max(min.h, Math.min(Math.round(height), deskHeight(vp)));
          const pos = clampWindowPosition(x, y, nw, nh, vp);
          return nw === w.w && nh === w.h && pos.x === w.x && pos.y === w.y
            ? w
            : { ...w, w: nw, h: nh, x: pos.x, y: pos.y };
        });
      },

      setHotel(id, hotelId) {
        update(id, (w) => {
          const app = getApp(w.appId);
          if (!app || !appVisibleInHotel(get(), app, hotelId)) return w;
          return { ...w, hotelId, title: titleFor(app, hotelId) };
        });
      },

      clearHotel(id) {
        update(id, (w) => {
          const app = getApp(w.appId);
          if (!app?.needsHotel) return w;
          return { ...w, hotelId: undefined, title: titleFor(app) };
        });
      },

      setWallpaper(wallpaper) {
        if (WALLPAPERS.includes(wallpaper)) set({ wallpaper });
      },

      setWallpaperColor(hex) {
        if (typeof hex === "string" && HEX_COLOR.test(hex)) set({ wallpaperColor: hex.toLowerCase() });
      },

      setFontScale(fontScale) {
        if (FONT_SCALES.includes(fontScale)) set({ fontScale });
      },

      setFontFamily(fontFamily) {
        if (FONT_FAMILIES.includes(fontFamily)) set({ fontFamily });
      },

      setTheme(theme) {
        if (THEMES.includes(theme)) set({ theme });
      },

      setFooterBand(on) {
        if (typeof on !== "boolean" || on === get().footerBand) return;
        const vp = effectiveViewport({ ...get(), footerBand: on });
        set({
          footerBand: on,
          windows: fitWindows(vp),
          icons: get().icons.map((i) => ({ appId: i.appId, ...iconPosition(i.x, i.y, vp) })),
        });
      },

      setFooterHeight(px) {
        if (!Number.isFinite(px) || px < 0 || px > FOOTER_HEIGHT_MAX) return;
        const footerHeight = Math.round(px);
        if (footerHeight === get().footerHeight) return;
        if (!get().footerBand) {
          set({ footerHeight });
          return;
        }
        const vp = effectiveViewport({ ...get(), footerHeight });
        set({
          footerHeight,
          windows: fitWindows(vp),
          icons: get().icons.map((i) => ({ appId: i.appId, ...iconPosition(i.x, i.y, vp) })),
        });
      },

      setBrandWatermark(on) {
        if (typeof on === "boolean") set({ brandWatermark: on });
      },

      setShortcutVersion(version) {
        if (Number.isInteger(version) && version >= 0) set({ shortcutVersion: version });
      },

      resetAppearance() {
        get().setFooterBand(DEFAULT_APPEARANCE.footerBand);
        set({ ...DEFAULT_APPEARANCE });
      },

      addIcon(appId, x, y) {
        const { icons } = get();
        if (!allowed(appId) || icons.some((i) => i.appId === appId)) return;
        set({ icons: [...icons, { appId, ...iconPosition(x, y, effectiveViewport(get())) }] });
      },

      moveIcon(appId, x, y) {
        const pos = iconPosition(x, y, effectiveViewport(get()));
        set({ icons: get().icons.map((i) => (i.appId === appId ? { appId, ...pos } : i)) });
      },

      removeIcon(appId) {
        set({ icons: get().icons.filter((i) => i.appId !== appId) });
      },

      setIcons(icons) {
        set({ icons });
      },

      arrangeIcons() {
        const vp = effectiveViewport(get());
        // Keep the visual reading order: left-to-right columns, top-to-bottom within a column.
        const sorted = [...get().icons].sort((a, b) => a.x - b.x || a.y - b.y);
        set({ icons: sorted.map((i, n) => ({ appId: i.appId, ...gridPosition(n, vp) })) });
      },

      snapshot() {
        const {
          wallpaper,
          wallpaperColor,
          fontScale,
          fontFamily,
          theme,
          footerBand,
          brandWatermark,
          shortcutVersion,
          icons,
          order,
          windows,
        } = get();
        return {
          wallpaper,
          wallpaperColor,
          fontScale,
          fontFamily,
          theme,
          footerBand,
          brandWatermark,
          shortcutVersion,
          icons: icons.map((i) => ({ ...i })),
          // Opening sub-view/outlet are one-off requests and are not saved in window preferences.
          windows: order.map((id) => {
            const win = { ...windows[id] };
            delete win.initialPanel;
            delete win.initialOutletId;
            return win;
          }),
        };
      },

      restore(p) {
        const footerBand = bool(p.footerBand, DEFAULT_APPEARANCE.footerBand);
        const vp = effectiveViewport({ ...get(), footerBand });
        const windows: Record<string, WinState> = {};
        const order: string[] = [];
        let maxSeq = 0;
        for (const saved of p.windows) {
          if (order.length >= MAX_WINDOWS) break;
          const app = allowed(saved.appId);
          if (!app || windows[saved.id]) continue;
          const hotelId = resolveHotel(app, saved.hotelId);
          const min = minSize(app);
          const w = Math.max(min.w, saved.w);
          const h = Math.max(min.h, saved.h);
          windows[saved.id] = {
            ...saved,
            hotelId,
            title: titleFor(app, hotelId),
            w,
            h,
            ...(saved.maximized
              ? maximizedRect(vp)
              : clampWindowPosition(saved.x, saved.y, w, h, vp)),
          };
          order.push(saved.id);
          const n = /^w(\d+)$/.exec(saved.id);
          if (n) maxSeq = Math.max(maxSeq, Number(n[1]));
        }
        const seen = new Set<string>();
        const icons: IconPos[] = [];
        for (const icon of p.icons) {
          if (!allowed(icon.appId) || seen.has(icon.appId)) continue;
          seen.add(icon.appId);
          icons.push({ appId: icon.appId, ...iconPosition(icon.x, icon.y, vp) });
        }
        // Stored z values are only an order: renumber from Z_BASE so they can never creep upwards.
        const ranked = renumberZ(windows, order);
        set({
          windows: ranked.windows,
          nextZ: ranked.nextZ,
          order,
          icons,
          wallpaper: oneOf(WALLPAPERS, p.wallpaper, DEFAULT_APPEARANCE.wallpaper),
          wallpaperColor:
            typeof p.wallpaperColor === "string" && HEX_COLOR.test(p.wallpaperColor)
              ? p.wallpaperColor.toLowerCase()
              : DEFAULT_APPEARANCE.wallpaperColor,
          fontScale: oneOf(FONT_SCALES, p.fontScale, DEFAULT_APPEARANCE.fontScale),
          fontFamily: oneOf(FONT_FAMILIES, p.fontFamily, DEFAULT_APPEARANCE.fontFamily),
          theme: oneOf(THEMES, p.theme, DEFAULT_APPEARANCE.theme),
          footerBand,
          brandWatermark: bool(p.brandWatermark, DEFAULT_APPEARANCE.brandWatermark),
          shortcutVersion: Number.isInteger(p.shortcutVersion) ? p.shortcutVersion : 0,
          seq: Math.max(get().seq, maxSeq + 1),
          cascade: 0,
          ready: true,
        });
      },
    };
  });
}

/** The shell's store (one per browser tab). Server rendering only ever reads its initial state. */
export const windowStore = createWindowStore();

export function useWindowStore<T>(selector: (s: WindowStore) => T): T {
  return useStore(windowStore, selector);
}
