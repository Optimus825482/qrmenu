import { inferAllergensForItem, type AllergenKey } from "./allergens";
import { contrastRatio, readableText } from "./contrast";
import type { OutletDesign } from "./design";
import type { GuestTheme } from "./server/guestState";

export type QualityLevel = "block" | "warn" | "info";
export type QualityCheckId =
  | "text-contrast"
  | "accent-contrast"
  | "button-contrast"
  | "photo-density"
  | "translations"
  | "allergens"
  | "long-detail";

export type QualityAffectedItem = {
  id: string;
  name: string;
  categoryPath: string;
  detail: string | null;
  imageUrl: string | null;
  allergens: string[];
  tags: string[];
  missingLangs?: string[];
  suggestedAllergens?: AllergenKey[];
  suggestedReason?: string;
  isNaturallyAllergenFree?: boolean;
};

export type QualityFinding = {
  id: QualityCheckId;
  level: QualityLevel;
  message: string;
  affectedItems?: QualityAffectedItem[];
};

/** What the checks need to know about one dish. */
export type QualityItem = {
  id?: string;
  name?: string;
  categoryPath?: string;
  detail: string | null;
  imageUrl: string | null;
  allergens: string[];
  tags: string[];
  translationLangs: string[];
};

const LANG_NAMES = { en: "İngilizce", de: "Almanca", ru: "Rusça", ar: "Arapça" } as const;
const TEXT_MIN = 4.5;
const ACCENT_MIN = 3;
const BLOCK_BELOW = 3;
const MAX_PHOTOS = 3;
const MISSING_TRANSLATION_SHARE = 0.2;
const LONG_DETAIL = 140;

function colourFindings(design: OutletDesign, theme: GuestTheme): QualityFinding[] {
  void design;
  const found: QualityFinding[] = [];
  const text = contrastRatio(readableText(theme.bg), theme.bg);
  if (text < TEXT_MIN) {
    found.push({
      id: "text-contrast",
      level: text < BLOCK_BELOW ? "block" : "warn",
      message: `Yazı ile arka plan arasındaki kontrast ${text.toFixed(1)}:1 (en az 4,5:1 olmalı). Arka plan rengini belirgin biçimde açın ya da koyulaştırın.`,
    });
  }
  const accent = contrastRatio(theme.accent, theme.bg);
  if (accent < ACCENT_MIN) {
    found.push({
      id: "accent-contrast",
      level: "warn",
      message: `Vurgu rengi arka planda zor seçiliyor (${accent.toFixed(1)}:1, en az 3:1). Fiyat ve başlıklar silik görünebilir.`,
    });
  }
  const button = contrastRatio(theme.textOnAccent, theme.accent);
  if (button < TEXT_MIN) {
    found.push({
      id: "button-contrast",
      level: button < BLOCK_BELOW ? "block" : "warn",
      message: `Düğme yazısı ile vurgu rengi arasındaki kontrast ${button.toFixed(1)}:1 (en az 4,5:1 olmalı). "Vurgu üstü yazı" rengini değiştirin.`,
    });
  }
  return found;
}

/** Colour findings that stop publishing. The server re-checks these; the client is not trusted. */
export function blockingFindings(design: OutletDesign, theme: GuestTheme): QualityFinding[] {
  return colourFindings(design, theme).filter((f) => f.level === "block");
}

function toAffected(item: QualityItem, index: number, extra: Partial<QualityAffectedItem> = {}): QualityAffectedItem {
  return {
    id: item.id ?? `item-${index}`,
    name: item.name ?? `Ürün #${index + 1}`,
    categoryPath: item.categoryPath ?? "",
    detail: item.detail,
    imageUrl: item.imageUrl,
    allergens: item.allergens,
    tags: item.tags,
    ...extra,
  };
}

export function evaluateQuality(input: { design: OutletDesign; theme: GuestTheme; items: QualityItem[] }): QualityFinding[] {
  const { design, theme, items } = input;
  const found = colourFindings(design, theme);

  const photoItems = items.filter((item) => item.imageUrl);
  const photos = photoItems.length;
  if (design.options.showImages && !design.options.curatedPhotos && photos > MAX_PHOTOS) {
    found.push({
      id: "photo-density",
      level: "info",
      message: `${photos} üründe fotoğraf var. Şık menülerde en çok ${MAX_PHOTOS} seçkin fotoğraf öne çıkar; "Küratörlü fotoğraf" modunu deneyin.`,
      affectedItems: photoItems.map((item, idx) => toAffected(item, idx)),
    });
  }

  if (items.length > 0) {
    const allLangs = Object.keys(LANG_NAMES) as (keyof typeof LANG_NAMES)[];
    const weak = allLangs.filter(
      (lang) => items.filter((item) => !item.translationLangs.includes(lang)).length / items.length > MISSING_TRANSLATION_SHARE,
    );
    if (weak.length > 0) {
      const missingTransItems = items
        .map((item, idx) => {
          const missingLangs = allLangs
            .filter((lang) => !item.translationLangs.includes(lang))
            .map((lang) => LANG_NAMES[lang]);
          if (missingLangs.length === 0) return null;
          return toAffected(item, idx, { missingLangs });
        })
        .filter((x): x is QualityAffectedItem => x !== null);

      found.push({
        id: "translations",
        level: "warn",
        message: `Çevirisi eksik ürünler %20'yi aşıyor: ${weak.map((lang) => LANG_NAMES[lang]).join(", ")}. Eksik metinler Türkçe gösterilir.`,
        affectedItems: missingTransItems,
      });
    }
  }

  if (design.options.showAllergens) {
    const missingItems = items.filter((item) => {
      if (item.allergens.length > 0) return false;
      if (!item.name) return true;
      const inferred = inferAllergensForItem({
        name: item.name,
        detail: item.detail,
        categoryPath: item.categoryPath,
      });
      return !inferred.isNaturallyAllergenFree;
    });
    const missing = missingItems.length;
    if (missing > 0) {
      found.push({
        id: "allergens",
        level: "warn",
        message: `${missing} üründe alerjen bilgisi boş. Alerjen ikonları açıkken boş bırakmak misafire "alerjen yok" izlenimi verir.`,
        affectedItems: missingItems.map((item, idx) => {
          const inferred = inferAllergensForItem({
            name: item.name ?? "",
            detail: item.detail,
            categoryPath: item.categoryPath,
          });
          return toAffected(item, idx, {
            suggestedAllergens: inferred.allergens,
            suggestedReason: inferred.reason,
            isNaturallyAllergenFree: inferred.isNaturallyAllergenFree,
          });
        }),
      });
    }
  }

  const longItems = items.filter((item) => (item.detail?.length ?? 0) > LONG_DETAIL);
  const long = longItems.length;
  if (long > 0) {
    found.push({
      id: "long-detail",
      level: "info",
      message: `${long} üründe açıklama ${LONG_DETAIL} karakterden uzun. Misafirler menüyü okumaz, tarar; 1-2 satır yeterlidir.`,
      affectedItems: longItems.map((item, idx) => toAffected(item, idx)),
    });
  }
  return found;
}
