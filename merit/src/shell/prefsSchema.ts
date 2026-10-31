import { z } from "zod";
import { WALLPAPERS, type ShellPrefs } from "./types";

/**
 * Shape check for `User.prefs.shell`. Prefs come from the browser, so sizes are capped; the store
 * re-validates app ids, hotels and geometry on restore anyway.
 */
const coord = z.number().finite().min(-10_000).max(100_000);
const size = z.number().finite().min(0).max(100_000);
const id = z.string().min(1).max(100);

const rect = z.object({ x: coord, y: coord, w: size, h: size });

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

export const shellPrefsSchema: z.ZodType<ShellPrefs> = z.object({
  wallpaper: z.enum(WALLPAPERS),
  icons: z.array(z.object({ appId: id, x: coord, y: coord })).max(200),
  windows: z.array(winState).max(30),
});

/** Parsed prefs, or null when missing or malformed (a stale shape is ignored, not trusted). */
export function parseShellPrefs(value: unknown): ShellPrefs | null {
  const parsed = shellPrefsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
