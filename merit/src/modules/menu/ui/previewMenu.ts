import type { OutletDesign } from "../design";
import type { GuestCallOption } from "../callOptions";
import { DEFAULT_CALL_OPTIONS } from "../server/callOptionDefaults";
import type { GuestCategory, GuestItem, GuestMenu } from "../server/guestMenu";
import type { MenuTreeNode } from "../server/menuTree";
import type { Locale } from "@/lib/i18n/locales";

export type PreviewTheme = { bg: string; accent: string; soft: string; textOnAccent: string };

const sample = (
  id: string,
  name: string,
  detail: string,
  price: string,
  image: string,
  tags: string[] = [],
  allergens: string[] = [],
  isAvailable = true,
): GuestItem => ({
  id,
  name,
  detail,
  price,
  imageUrl: `/menu-samples/${image}.svg`,
  allergens,
  tags,
  isAvailable,
});

/** Shown until the outlet has its own dishes, so the studio is never an empty phone. */
export const SAMPLE_CATEGORIES: GuestCategory[] = [
  {
    id: "sample-signatures",
    name: "İmzalar",
    items: [
      sample("sample-mojito", "Royal Mojito", "Taze nane, misket limonu ve dengeli rom dokunuşu.", "16.00", "cocktail", ["SEFIN_SECIMI"], ["alkol"]),
      sample("sample-spritz", "Gün Batımı Spritz", "Narenciye aroması ve hafif köpüklü bitiş.", "18.00", "cocktail", ["POPULER", "YENI"], ["alkol"]),
    ],
    subcategories: [],
  },
  {
    id: "sample-cool",
    name: "Serinletici",
    items: [],
    subcategories: [
      {
        id: "sample-soft",
        name: "Alkolsüz",
        items: [
          sample("sample-hibiscus", "Hibiskus Fizz", "Hibiskus, lime ve ferah soda.", "11.00", "lemonade", ["VEGAN", "GLUTENSIZ"]),
          sample("sample-cooler", "Orman Meyveli Cooler", "Mevsim meyveleri, lime ve taze fesleğen.", "12.00", "smoothie", ["VEJETARYEN"], ["sut"], false),
        ],
        groups: [],
      },
    ],
  },
  {
    id: "sample-share",
    name: "Paylaşmalıklar",
    items: [],
    subcategories: [
      {
        id: "sample-plates",
        name: "Masaya",
        items: [
          sample("sample-burger", "Mini Royal Burger", "Izgara köfte, cheddar ve ev yapımı sos.", "19.00", "burger", ["POPULER"], ["gluten", "sut"]),
          sample("sample-salad", "Akdeniz Paylaşım Tabağı", "Zeytin, peynir, kuru meyve ve çıtır ekmek.", "22.00", "salad", ["VEJETARYEN"], ["sut", "gluten", "kuruyemis"]),
        ],
        groups: [],
      },
    ],
  },
  {
    id: "sample-sweet",
    name: "Tatlı",
    items: [
      sample("sample-tart", "Çikolatalı Tart", "Bitter çikolata ganajı ve çıtır tart.", "13.00", "dessert", ["SEFIN_SECIMI"], ["gluten", "sut", "yumurta"]),
    ],
    subcategories: [],
  },
];

function activeNodes(nodes: MenuTreeNode[]): MenuTreeNode[] {
  return nodes.filter((node) => node.isActive);
}

function toItem(node: MenuTreeNode, locale?: Locale): GuestItem {
  const trans = locale ? node.translations.find((t) => t.lang === locale) : null;
  const detail = trans?.detail?.trim() || node.detail || undefined;
  return {
    id: node.id,
    name: trans?.name?.trim() || node.name,
    ...(detail ? { detail } : {}),
    imageUrl: node.imageUrl,
    allergens: node.allergens,
    tags: node.tags,
    isAvailable: node.isAvailable,
    ...(node.price ? { price: node.price } : {}),
  };
}

function categoriesFromTree(nodes: MenuTreeNode[], locale?: Locale): GuestCategory[] {
  const categories: GuestCategory[] = [];
  for (const category of activeNodes(nodes).filter((node) => node.kind === "KATEGORI")) {
    const trCat = locale ? category.translations.find((t) => t.lang === locale) : null;
    const catName = trCat?.name?.trim() || category.name;
    const items = activeNodes(category.children).filter((node) => node.kind === "OGE").map((n) => toItem(n, locale));
    const subcategories = activeNodes(category.children)
      .filter((node) => node.kind === "ALT_KATEGORI")
      .map((sub) => {
        const trSub = locale ? sub.translations.find((t) => t.lang === locale) : null;
        const subName = trSub?.name?.trim() || sub.name;
        const subItems = activeNodes(sub.children).filter((node) => node.kind === "OGE").map((n) => toItem(n, locale));
        const groups = activeNodes(sub.children)
          .filter((node) => node.kind === "GRUP")
          .map((group) => {
            const trGroup = locale ? group.translations.find((t) => t.lang === locale) : null;
            const groupDetail = trGroup?.detail?.trim() || group.detail || undefined;
            return {
              id: group.id,
              name: trGroup?.name?.trim() || group.name,
              ...(groupDetail ? { detail: groupDetail } : {}),
              items: activeNodes(group.children).filter((node) => node.kind === "OGE").map((n) => toItem(n, locale)),
            };
          })
          .filter((group) => group.items.length > 0);
        return { id: sub.id, name: subName, items: subItems, groups };
      })
      .filter((sub) => sub.items.length > 0 || sub.groups.length > 0);
    if (items.length > 0 || subcategories.length > 0) {
      categories.push({ id: category.id, name: catName, items, subcategories });
    }
  }
  return categories;
}

export function previewMenu(input: {
  nodes: MenuTreeNode[];
  design: OutletDesign;
  theme: PreviewTheme;
  hotelName: string;
  outletName: string;
  callOptions?: GuestCallOption[];
  locale?: Locale;
}): { menu: GuestMenu; sample: boolean } {
  const categories = categoriesFromTree(input.nodes, input.locale);
  const sampleMenu = categories.length === 0;
  return {
    sample: sampleMenu,
    menu: {
      categories: sampleMenu ? SAMPLE_CATEGORIES : categories,
      state: {
        outletId: "onizleme",
        hotelId: "onizleme",
        outletName: input.outletName,
        hotelName: input.hotelName,
        menuOpen: true,
        orderingOpen: false,
        pricesShown: input.design.options.showPrices,
        currency: "EUR",
        theme: input.theme,
        design: input.design,
        callOptions:
          input.callOptions ??
          DEFAULT_CALL_OPTIONS.map((opt, i) => ({
            id: `sample-call-${i}`,
            label: opt.label,
            translations: opt.translations,
            callType: opt.callType,
          })),
      },
    },
  };
}
