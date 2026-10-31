/** Allergen codes a menu item can carry (display names live in the guest i18n messages). */
export const ALLERGENS = [
  "gluten",
  "sut",
  "yumurta",
  "kuruyemis",
  "deniz_urunu",
  "alkol",
  "soya",
  "susam",
] as const;
export type AllergenKey = (typeof ALLERGENS)[number];
