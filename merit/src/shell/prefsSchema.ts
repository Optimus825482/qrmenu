import { z } from "zod";
import {
  DEFAULT_APPEARANCE,
  FONT_FAMILIES,
  FONT_SCALES,
  HEX_COLOR,
  MAX_WINDOWS,
  THEMES,
  WALLPAPERS,
  type ShellPrefs,
} from "./types";

/**
 * Shape check for `User.prefs.shell`. Prefs come from the browser, so sizes are capped; the store
 * re-validates app ids, hotels and geometry on restore anyway. The appearance fields added later
 * (font, theme, wallpaper color, brand switches) default when missing, so older records stay valid. Every field
 * falls back to its own default when malformed (`.catch`), and list entries that fail are dropped one by one,
 * so a single bad field never discards the whole saved layout. Only a non-object value yields null.
 */
const coord = z.number().finite().min(-10_000).max(100_000);
const size = z.number().finite().min(0).max(100_000);
const id = z.string().min(1).max(100);

const rect = z.object({ x: coord, y: coord, w: size, h: size });

/** Array that keeps its valid entries (up to `max`) and drops the rest; a non-array becomes []. */
function lenientArray<T extends z.ZodType>(item: T, max: number) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((list) => list.flatMap((v) => {
      const r = item.safeParse(v);
      return r.success ? [r.data as z.output<T>] : [];
    }).slice(0, max));
}

const winState = z.object({
  id,
  appId: id,
  hotelId: id.optional(),
  title: z.string().max(200),
  x: coord,
  y: coord,
  w: size,
  h: size,
  minimized: z.boolean(),
  maximized: z.boolean(),
  prev: rect.optional(),
  z: z.number().int().min(0).max(1_000_000_000),
});

const shellPrefsShape = {
  recentApps: lenientArray(id, 6),
  xpDensity: z.enum(["comfortable", "compact"]).catch("comfortable"),
  wallpaper: z.enum(WALLPAPERS).catch(DEFAULT_APPEARANCE.wallpaper),
  wallpaperColor: z.string().regex(HEX_COLOR).catch(DEFAULT_APPEARANCE.wallpaperColor),
  fontScale: z.enum(FONT_SCALES).catch(DEFAULT_APPEARANCE.fontScale),
  fontFamily: z.enum(FONT_FAMILIES).catch(DEFAULT_APPEARANCE.fontFamily),
  theme: z.enum(THEMES).catch(DEFAULT_APPEARANCE.theme),
  footerBand: z.boolean().catch(DEFAULT_APPEARANCE.footerBand),
  brandWatermark: z.boolean().catch(DEFAULT_APPEARANCE.brandWatermark),
  icons: lenientArray(z.object({ appId: id, x: coord, y: coord }), 200),
  windows: lenientArray(winState, MAX_WINDOWS),
  /** One-time shortcut migrations; absent in layouts saved before this field was introduced. */
  shortcutVersion: z.number().int().min(0).catch(0),
  /** Tercih edilen kabuk; yoksa ekranın doğal bağlamı kullanılır. */
  preferredShell: z.enum(["xp", "personel", "pos"]).optional().catch(undefined),
};

/** Read-side schema: a malformed stored field falls back to its default instead of dropping the layout. */
export const shellPrefsSchema: z.ZodType<ShellPrefs> = z.object(shellPrefsShape);

/**
 * Write-side schema for a NEW save request: the named choices (density, wallpaper, font size, font,
 * theme) must be valid when present (missing ones default), so a bad request fails with VALIDATION. Everything else stays tolerant like the read side.
 */
export const shellPrefsInputSchema: z.ZodType<ShellPrefs> = z.object({
  ...shellPrefsShape,
  xpDensity: z.enum(["comfortable", "compact"]).default("comfortable"),
  wallpaper: z.enum(WALLPAPERS).default(DEFAULT_APPEARANCE.wallpaper),
  fontScale: z.enum(FONT_SCALES).default(DEFAULT_APPEARANCE.fontScale),
  fontFamily: z.enum(FONT_FAMILIES).default(DEFAULT_APPEARANCE.fontFamily),
  theme: z.enum(THEMES).default(DEFAULT_APPEARANCE.theme),
});

/** Parsed prefs, or null when missing or malformed (a stale shape is ignored, not trusted). */
export function parseShellPrefs(value: unknown): ShellPrefs | null {
  const parsed = shellPrefsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
