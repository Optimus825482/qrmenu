import type { CSSProperties } from "react";
import type { FontFamily, FontScale, Theme } from "./types";

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
};

export const FONT_SCALE_PX: Record<FontScale, string> = {
  S: "11px",
  M: "12px",
  L: "13px",
  XL: "14px",
};

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  tahoma: "Tahoma",
  segoe: "Segoe UI",
  verdana: "Verdana",
  arial: "Arial",
  system: "Sistem yazı tipi",
};

export const FONT_STACKS: Record<FontFamily, string> = {
  tahoma: 'Tahoma, "Segoe UI", sans-serif',
  segoe: '"Segoe UI", Tahoma, sans-serif',
  verdana: "Verdana, Geneva, sans-serif",
  arial: "Arial, Helvetica, sans-serif",
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
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
    "--xp-font-family": FONT_STACKS[family],
    // Color of the "Düz renk" wallpaper ([data-wallpaper="ozel"] in theme.css).
    ...(wallpaperColor ? { "--xp-wallpaper-custom": wallpaperColor } : {}),
  } as CSSProperties;
}
