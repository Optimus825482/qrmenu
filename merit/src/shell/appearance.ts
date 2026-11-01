import type { CSSProperties } from "react";
import {
  DEFAULT_APPEARANCE,
  FONT_FAMILIES,
  THEMES,
  type FontFamily,
  type FontScale,
  type Theme,
} from "./types";

/**
 * Option labels and values of the appearance settings (Denetim Masası and the mobile Ayarlar tab
 * share them through AppearanceOptions). Shell colors live in theme.css; font values are here
 * because the shell root sets them as inline CSS variables.
 */

/**
 * Luna blue (theme.css `--xp-title-1`) as the installed app's color: manifest theme/background
 * and the `theme-color` meta. Browser UI cannot read CSS variables, hence the literal.
 */
export const APP_THEME_COLOR = "#0058e6";

export const FONT_SCALE_LABELS: Record<FontScale, string> = {
  S: "Küçük",
  M: "Orta",
  L: "Büyük",
  XL: "Çok büyük",
  XXL: "İri",
  XXXL: "Çok iri",
};

export const FONT_SCALE_PX: Record<FontScale, string> = {
  S: "11px",
  M: "12px",
  L: "13px",
  XL: "14px",
  XXL: "16px",
  XXXL: "18px",
};

const FONT_SCALE_UI: Record<FontScale, number> = {
  S: 0.917,
  M: 1,
  L: 1.083,
  XL: 1.167,
  XXL: 1.333,
  XXXL: 1.5,
};

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  tahoma: "Tahoma",
  segoe: "Segoe UI",
  verdana: "Verdana",
  arial: "Arial",
  system: "Sistem yazı tipi",
  microsoftSans: "Microsoft Sans Serif",
  robotoMedium: "Roboto Medium",
};

export const FONT_STACKS: Record<FontFamily, string> = {
  tahoma: 'Tahoma, "Segoe UI", sans-serif',
  segoe: '"Segoe UI", Tahoma, sans-serif',
  verdana: "Verdana, Geneva, sans-serif",
  arial: "Arial, Helvetica, sans-serif",
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  microsoftSans: '"Microsoft Sans Serif", Arial, sans-serif',
  robotoMedium: 'Roboto, "Segoe UI", sans-serif',
};

export const FONT_WEIGHTS: Record<FontFamily, number> = {
  tahoma: 400,
  segoe: 400,
  verdana: 400,
  arial: 400,
  system: 400,
  microsoftSans: 400,
  robotoMedium: 500,
};

export const THEME_LABELS: Record<Theme, string> = {
  luna: "Luna",
  zeytin: "Zeytin",
  gumus: "Gümüş",
  royal: "Royal Gold",
};

/** Inline style of a shell root: the font variables every shell text size derives from (+ wallpaper color). */
export function fontVariables(
  scale: FontScale,
  family: FontFamily,
  wallpaperColor?: string,
): CSSProperties {
  return {
    "--xp-font-size": FONT_SCALE_PX[scale],
    "--xp-ui-scale": FONT_SCALE_UI[scale],
    "--xp-font-family": FONT_STACKS[family],
    "--xp-font-weight": FONT_WEIGHTS[family],
    // Color of the "Düz renk" wallpaper ([data-wallpaper="ozel"] in theme.css).
    ...(wallpaperColor ? { "--xp-wallpaper-custom": wallpaperColor } : {}),
  } as CSSProperties;
}

/** The shell appearance an iframe app page follows (`?font=&theme=`). */
export type FrameAppearance = { fontFamily: FontFamily; theme: Theme };

/**
 * Adds the shell's current font and theme to a same-origin iframe app URL (`?font=&theme=`),
 * keeping its own query string and hash. Existing `font`/`theme` params are replaced.
 */
export function appFrameUrl(url: string, appearance: FrameAppearance): string {
  const hashAt = url.indexOf("#");
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const rest = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = rest.indexOf("?");
  const path = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? "" : rest.slice(queryAt + 1));
  params.set("font", appearance.fontFamily);
  params.set("theme", appearance.theme);
  return `${path}?${params.toString()}${hash}`;
}

/** Reads `?font=&theme=` on an iframe app page; unknown or missing values fall back to the defaults. */
export function parseFrameAppearance(params: {
  font?: string | string[];
  theme?: string | string[];
}): FrameAppearance {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const font = one(params.font);
  const theme = one(params.theme);
  return {
    fontFamily: FONT_FAMILIES.find((f) => f === font) ?? DEFAULT_APPEARANCE.fontFamily,
    theme: THEMES.find((t) => t === theme) ?? DEFAULT_APPEARANCE.theme,
  };
}
