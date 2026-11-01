/** EU 1169/2011 Annex II allergen codes. Display names live in the guest i18n messages. */
export const ALLERGENS = [
  "gluten",
  "sut",
  "yumurta",
  "kuruyemis",
  "yerfistigi",
  "deniz_urunu",
  "yumusakca",
  "balik",
  "alkol",
  "soya",
  "susam",
  "kereviz",
  "hardal",
  "sulfit",
  "acibakla",
] as const;
export type AllergenKey = (typeof ALLERGENS)[number];
