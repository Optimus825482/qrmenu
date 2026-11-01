"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { FONT_FAMILY_LABELS, FONT_SCALE_LABELS, FONT_STACKS, FONT_WEIGHTS, THEME_LABELS } from "../appearance";
import {
  FONT_FAMILIES,
  FONT_SCALES,
  HEX_COLOR,
  THEMES,
  WALLPAPER_LABELS,
  WALLPAPERS,
} from "../types";
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

type SwitchProps = {
  variant: Variant;
  label: string;
  checked: boolean;
  onChange(on: boolean): void;
};

/** A labelled on/off switch: a native checkbox on the desktop, the Material-style toggle on mobile. */
function SwitchRow({ variant, label, checked, onChange }: SwitchProps) {
  const id = useId();
  if (variant === "mobile") {
    return (
      <div className="mb-switch-row">
        <span id={id} className="mb-switch-text">
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={id}
          className="mb-switch"
          onClick={() => onChange(!checked)}
        >
          <span className="mb-switch-thumb" />
        </button>
      </div>
    );
  }
  return (
    <label className="xp-cp-choice">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * "Arka plan rengi": a color picker plus a #rrggbb field for the "Düz renk" wallpaper. A valid
 * color switches the wallpaper to it; text that is not (yet) a color is kept in the field only.
 */
function WallpaperColor({ variant }: { variant: Variant }) {
  const color = useWindowStore((s) => s.wallpaperColor);
  // Text typed in the field while it is not a valid color yet; null = show the stored color.
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();

  const apply = (value: string) => {
    if (!HEX_COLOR.test(value)) {
      setDraft(value);
      return;
    }
    setDraft(null);
    const store = windowStore.getState();
    store.setWallpaperColor(value);
    store.setWallpaper("ozel");
  };

  return (
    <div className={variant === "xp" ? "xp-cp-color" : "mb-color"}>
      <label htmlFor={`${id}-hex`}>Arka plan rengi</label>
      <input
        type="color"
        aria-label="Renk seçici"
        value={color}
        onChange={(e) => apply(e.target.value)}
      />
      <input
        id={`${id}-hex`}
        type="text"
        value={draft ?? color}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => apply(e.target.value.trim())}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

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
 * Yazı boyutu, yazı tipi, duvar kağıdı, tema and the Marka switches (alt telif bandı, filigran),
 * read from and written to the shell store (the change applies at once; useShellPersistence saves
 * it). Used by Denetim Masası and the mobile
 * Ayarlar tab, so both offer the same options.
 */
export function AppearanceOptions({ variant }: { variant: Variant }) {
  const fontScale = useWindowStore((s) => s.fontScale);
  const fontFamily = useWindowStore((s) => s.fontFamily);
  const wallpaper = useWindowStore((s) => s.wallpaper);
  const theme = useWindowStore((s) => s.theme);
  const footerBand = useWindowStore((s) => s.footerBand);
  const brandWatermark = useWindowStore((s) => s.brandWatermark);
  const brandId = useId();
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
        optionStyle={(f) => ({ fontFamily: FONT_STACKS[f], fontWeight: FONT_WEIGHTS[f] })}
      />
      <ChoiceGroup
        variant={variant}
        label="Duvar kağıdı"
        options={WALLPAPERS}
        labels={WALLPAPER_LABELS}
        value={wallpaper}
        onChange={(v) => store().setWallpaper(v)}
        swatch={(w) => <span className={cls.swatch} data-wallpaper={w} aria-hidden="true" />}
      >
        <WallpaperColor variant={variant} />
      </ChoiceGroup>
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
      <section className={cls.section} aria-labelledby={`${brandId}-label`}>
        <h3 className={cls.heading} id={`${brandId}-label`}>
          Marka
        </h3>
        <div className={variant === "xp" ? cls.choices : undefined}>
          <SwitchRow
            variant={variant}
            label="Alt telif bandı"
            checked={footerBand}
            onChange={(on) => store().setFooterBand(on)}
          />
          <SwitchRow
            variant={variant}
            label="Duvar kağıdı filigranı"
            checked={brandWatermark}
            onChange={(on) => store().setBrandWatermark(on)}
          />
        </div>
      </section>
    </>
  );
}
