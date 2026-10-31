"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { FONT_FAMILY_LABELS, FONT_SCALE_LABELS, FONT_STACKS, THEME_LABELS } from "../appearance";
import { FONT_FAMILIES, FONT_SCALES, THEMES, WALLPAPER_LABELS, WALLPAPERS } from "../types";
import { useWindowStore, windowStore } from "../windowStore";

type Variant = "xp" | "mobile";

/** Class names per shell: the XP Denetim Masası and the mobile Ayarlar tab share the markup. */
const CLASSES: Record<
  Variant,
  {
    section: string;
    heading: string;
    choices: string;
    choice: string;
    swatches: string;
    swatchChoice: string;
    swatch: string;
    preview: string;
  }
> = {
  xp: {
    section: "xp-cp-section",
    heading: "xp-cp-heading",
    choices: "xp-cp-choices",
    choice: "xp-cp-choice",
    swatches: "xp-cp-swatches",
    swatchChoice: "xp-cp-swatch-choice",
    swatch: "xp-cp-swatch",
    preview: "xp-cp-preview",
  },
  mobile: {
    section: "mb-card",
    heading: "mb-subheading",
    choices: "mb-choices",
    choice: "mb-choice",
    swatches: "mb-wallpapers",
    swatchChoice: "mb-wallpaper",
    swatch: "mb-wallpaper-swatch",
    preview: "mb-preview",
  },
};

const PREVIEW_TEXT = "Örnek metin: Merit OS — ÇĞİÖŞÜ çğıöşü 0123456789";

type GroupProps<T extends string> = {
  variant: Variant;
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange(value: T): void;
  /** Swatch boxes (wallpaper, theme) instead of a plain radio list. */
  swatch?: (option: T) => ReactNode;
  optionStyle?: (option: T) => CSSProperties | undefined;
  children?: ReactNode;
};

/** One labelled radio group (native radios: arrow keys move between options). */
function ChoiceGroup<T extends string>({
  variant,
  label,
  options,
  labels,
  value,
  onChange,
  swatch,
  optionStyle,
  children,
}: GroupProps<T>) {
  const id = useId();
  const cls = CLASSES[variant];
  return (
    <section className={cls.section} aria-labelledby={`${id}-label`}>
      <h3 className={cls.heading} id={`${id}-label`}>
        {label}
      </h3>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className={swatch ? cls.swatches : cls.choices}
      >
        {options.map((option) => (
          <label key={option} className={swatch ? cls.swatchChoice : cls.choice}>
            <input
              type="radio"
              name={id}
              value={option}
              checked={option === value}
              onChange={() => onChange(option)}
            />
            {swatch ? swatch(option) : null}
            <span style={optionStyle?.(option)}>{labels[option]}</span>
          </label>
        ))}
      </div>
      {children}
    </section>
  );
}

/**
 * Yazı boyutu, yazı tipi, duvar kağıdı and tema, read from and written to the shell store (the
 * change applies at once; useShellPersistence saves it). Used by Denetim Masası and the mobile
 * Ayarlar tab, so both offer the same options.
 */
export function AppearanceOptions({ variant }: { variant: Variant }) {
  const fontScale = useWindowStore((s) => s.fontScale);
  const fontFamily = useWindowStore((s) => s.fontFamily);
  const wallpaper = useWindowStore((s) => s.wallpaper);
  const theme = useWindowStore((s) => s.theme);
  const cls = CLASSES[variant];
  const store = () => windowStore.getState();

  return (
    <>
      <ChoiceGroup
        variant={variant}
        label="Yazı boyutu"
        options={FONT_SCALES}
        labels={FONT_SCALE_LABELS}
        value={fontScale}
        onChange={(v) => store().setFontScale(v)}
      >
        <p className={cls.preview}>{PREVIEW_TEXT}</p>
      </ChoiceGroup>
      <ChoiceGroup
        variant={variant}
        label="Yazı tipi"
        options={FONT_FAMILIES}
        labels={FONT_FAMILY_LABELS}
        value={fontFamily}
        onChange={(v) => store().setFontFamily(v)}
        optionStyle={(f) => ({ fontFamily: FONT_STACKS[f] })}
      />
      <ChoiceGroup
        variant={variant}
        label="Duvar kağıdı"
        options={WALLPAPERS}
        labels={WALLPAPER_LABELS}
        value={wallpaper}
        onChange={(v) => store().setWallpaper(v)}
        swatch={(w) => <span className={cls.swatch} data-wallpaper={w} aria-hidden="true" />}
      />
      <ChoiceGroup
        variant={variant}
        label="Tema"
        options={THEMES}
        labels={THEME_LABELS}
        value={theme}
        onChange={(v) => store().setTheme(v)}
        swatch={(t) => (
          <span className={`${cls.swatch} xp-theme-swatch`} data-theme={t} aria-hidden="true" />
        )}
      />
    </>
  );
}
