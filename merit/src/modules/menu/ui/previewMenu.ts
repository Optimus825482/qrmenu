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

const SAMPLE_DATA: Record<
  Locale,
  {
    catSignatures: string;
    mojitoName: string;
    mojitoDesc: string;
    spritzName: string;
    spritzDesc: string;
    catCool: string;
    subSoft: string;
    fizzName: string;
    fizzDesc: string;
    coolerName: string;
    coolerDesc: string;
    catShare: string;
    subPlates: string;
    burgerName: string;
    burgerDesc: string;
    saladName: string;
    saladDesc: string;
    catSweet: string;
    tartName: string;
    tartDesc: string;
  }
> = {
  tr: {
    catSignatures: "İmzalar",
    mojitoName: "Royal Mojito",
    mojitoDesc: "Taze nane, misket limonu ve dengeli rom dokunuşu.",
    spritzName: "Gün Batımı Spritz",
    spritzDesc: "Narenciye aroması ve hafif köpüklü bitiş.",
    catCool: "Serinletici",
    subSoft: "Alkolsüz",
    fizzName: "Hibiskus Fizz",
    fizzDesc: "Hibiskus, lime ve ferah soda.",
    coolerName: "Orman Meyveli Cooler",
    coolerDesc: "Mevsim meyveleri, lime ve taze fesleğen.",
    catShare: "Paylaşmalıklar",
    subPlates: "Masaya",
    burgerName: "Mini Royal Burger",
    burgerDesc: "Izgara köfte, cheddar ve ev yapımı sos.",
    saladName: "Akdeniz Paylaşım Tabağı",
    saladDesc: "Zeytin, peynir, kuru meyve ve çıtır ekmek.",
    catSweet: "Tatlı",
    tartName: "Çikolatalı Tart",
    tartDesc: "Bitter çikolata ganajı ve çıtır tart.",
  },
  en: {
    catSignatures: "Signatures",
    mojitoName: "Royal Mojito",
    mojitoDesc: "Fresh mint, lime and balanced touch of rum.",
    spritzName: "Sunset Spritz",
    spritzDesc: "Citrus aroma with a delicate sparkling finish.",
    catCool: "Refreshers",
    subSoft: "Non-alcoholic",
    fizzName: "Hibiscus Fizz",
    fizzDesc: "Hibiscus, lime and sparkling soda.",
    coolerName: "Berry Cooler",
    coolerDesc: "Seasonal berries, lime and fresh basil.",
    catShare: "To Share",
    subPlates: "For the Table",
    burgerName: "Mini Royal Burger",
    burgerDesc: "Grilled patty, cheddar and homemade sauce.",
    saladName: "Mediterranean Platter",
    saladDesc: "Olives, cheeses, dried fruit and crispy bread.",
    catSweet: "Dessert",
    tartName: "Chocolate Tart",
    tartDesc: "Dark chocolate ganache in a crisp crust.",
  },
  de: {
    catSignatures: "Signature",
    mojitoName: "Royal Mojito",
    mojitoDesc: "Frische Minze, Limette und ausgewogener Rum.",
    spritzName: "Sunset Spritz",
    spritzDesc: "Zitrusaromen mit spritzigem Abgang.",
    catCool: "Erfrischend",
    subSoft: "Alkoholfrei",
    fizzName: "Hibiskus Fizz",
    fizzDesc: "Hibiskus, Limette und prickelndes Soda.",
    coolerName: "Beeren Cooler",
    coolerDesc: "Saisonale Beeren, Limette und Basilikum.",
    catShare: "Zum Teilen",
    subPlates: "Für den Tisch",
    burgerName: "Mini Royal Burger",
    burgerDesc: "Gegrilltes Patty, Cheddar und Haussauce.",
    saladName: "Mediterrane Platte",
    saladDesc: "Oliven, Käse, Trockenfrüchte und Knusperbrot.",
    catSweet: "Dessert",
    tartName: "Schokoladentarte",
    tartDesc: "Dunkle Schokoladenganache und knuspriger Mürbeteig.",
  },
  ru: {
    catSignatures: "Фирменное",
    mojitoName: "Royal Mojito",
    mojitoDesc: "Свежая мята, лайм и сбалансированный ром.",
    spritzName: "Sunset Spritz",
    spritzDesc: "Цитрусовый аромат с лёгкими пузырьками.",
    catCool: "Освежающее",
    subSoft: "Безалкогольное",
    fizzName: "Гибискус Физз",
    fizzDesc: "Гибискус, лайм и содовая.",
    coolerName: "Ягодный кулер",
    coolerDesc: "Сезонные ягоды, лайм и свежий базилик.",
    catShare: "Закуски",
    subPlates: "На компанию",
    burgerName: "Мини Роял Бургер",
    burgerDesc: "Котлета на гриле, чеддер и соус.",
    saladName: "Средиземноморское плато",
    saladDesc: "Оливки, сыры, сухофрукты и хрустящий хлеб.",
    catSweet: "Десерты",
    tartName: "Шоколадный тарт",
    tartDesc: "Ганаш из тёмного шоколада и хрустящий тарт.",
  },
  ar: {
    catSignatures: "المشروبات المميزة",
    mojitoName: "رويال موهيتو",
    mojitoDesc: "نعناع طازج، ليمون ولمسة متوازنة من الروم.",
    spritzName: "صن سيت سبريتز",
    spritzDesc: "نكهة الحمضيات مع لمسة فوارة خفيفة.",
    catCool: "المرطبات",
    subSoft: "غير كحولي",
    fizzName: "كركديه فيز",
    fizzDesc: "كركديه، ليمون وصودا منعشة.",
    coolerName: "كوولر التوت البري",
    coolerDesc: "توت موسمي، ليمون وريحان طازج.",
    catShare: "أطباق للمشاركة",
    subPlates: "للطاولة",
    burgerName: "ميني رويال برجر",
    burgerDesc: "لحم مشوي، شيدر وصلصة منزلية.",
    saladName: "طبق البحر المتوسط",
    saladDesc: "زيتون، أجبان، فواكه مجففة وخبز مقرمش.",
    catSweet: "الحلويات",
    tartName: "تارت الشوكولاتة",
    tartDesc: "جناش الشوكولاتة الداكنة وتارت مقرمش.",
  },
  fr: {
    catSignatures: "Signatures",
    mojitoName: "Royal Mojito",
    mojitoDesc: "Menthe fraîche, citron vert et touche équilibrée de rhum.",
    spritzName: "Sunset Spritz",
    spritzDesc: "Arômes d'agrumes et délicate touche pétillante.",
    catCool: "Rafraîchissant",
    subSoft: "Sans alcool",
    fizzName: "Hibiscus Fizz",
    fizzDesc: "Hibiscus, citron vert et soda frais.",
    coolerName: "Cooler aux baies",
    coolerDesc: "Fruits de saison, citron vert et basilic.",
    catShare: "À partager",
    subPlates: "Pour la table",
    burgerName: "Mini Royal Burger",
    burgerDesc: "Steak grillé, cheddar et sauce maison.",
    saladName: "Assiette méditerranéenne",
    saladDesc: "Olives, fromages, fruits secs et pain croustillant.",
    catSweet: "Dessert",
    tartName: "Tarte au chocolat",
    tartDesc: "Ganache chocolat noir et pâte sablée croquante.",
  },
  el: {
    catSignatures: "Signatures",
    mojitoName: "Royal Mojito",
    mojitoDesc: "Φρέσκια μέντα, μοσχολέμονο και ισορροπημένο ρούμι.",
    spritzName: "Sunset Spritz",
    spritzDesc: "Άρωμα εσπεριδοειδών με αφρώδες τελείωμα.",
    catCool: "Δροσιστικά",
    subSoft: "Χωρίς αλκοόλ",
    fizzName: "Hibiscus Fizz",
    fizzDesc: "Ιβίσκος, λάιμ και δροσερή σόδα.",
    coolerName: "Berry Cooler",
    coolerDesc: "Μούρα εποχής, λάιμ και φρέσκος βασιλικός.",
    catShare: "Για τη μέση",
    subPlates: "Για το τραπέζι",
    burgerName: "Mini Royal Burger",
    burgerDesc: "Μπιφτέκι σχάρας, τσένταρ και σπιτική σάλτσα.",
    saladName: "Μεσογειακό Πλατό",
    saladDesc: "Ελιές, τυριά, αποξηραμένα φρούτα και τραγανό ψωμί.",
    catSweet: "Επιδόρπιο",
    tartName: "Τάρτα Σοκολάτας",
    tartDesc: "Γκανάζ μαύρης σοκολάτας και τραγανή βάση.",
  },
  it: {
    catSignatures: "Signature",
    mojitoName: "Royal Mojito",
    mojitoDesc: "Menta fresca, lime e tocco bilanciato di rum.",
    spritzName: "Sunset Spritz",
    spritzDesc: "Aroma di agrumi con finale piacevolmente frizzante.",
    catCool: "Rinfrescanti",
    subSoft: "Analcolici",
    fizzName: "Hibiscus Fizz",
    fizzDesc: "Ibisco, lime e soda fresca.",
    coolerName: "Berry Cooler",
    coolerDesc: "Frutti di bosco, lime e basilico fresco.",
    catShare: "Da condividere",
    subPlates: "Per il tavolo",
    burgerName: "Mini Royal Burger",
    burgerDesc: "Patty grigliato, cheddar e salsa artigianale.",
    saladName: "Tagliere mediterraneo",
    saladDesc: "Olive, formaggi, frutta secca e pane croccante.",
    catSweet: "Dessert",
    tartName: "Crostata al cioccolato",
    tartDesc: "Ganache al cioccolato fondente e frolla croccante.",
  },
  pt: {
    catSignatures: "Assinaturas",
    mojitoName: "Royal Mojito",
    mojitoDesc: "Hortelã fresca, limão e um toque equilibrado de rum.",
    spritzName: "Sunset Spritz",
    spritzDesc: "Aroma cítrico com um final delicadamente espumante.",
    catCool: "Refrescantes",
    subSoft: "Sem álcool",
    fizzName: "Hibiscus Fizz",
    fizzDesc: "Hibisco, limão e soda gelada.",
    coolerName: "Berry Cooler",
    coolerDesc: "Frutas vermelhas da estação, limão e manjericão fresco.",
    catShare: "Para compartilhar",
    subPlates: "Para a mesa",
    burgerName: "Mini Royal Burger",
    burgerDesc: "Hambúrguer grelhado, cheddar e molho da casa.",
    saladName: "Tábua mediterrânea",
    saladDesc: "Azeitonas, queijos, frutas secas e pão crocante.",
    catSweet: "Sobremesa",
    tartName: "Torta de chocolate",
    tartDesc: "Ganache de chocolate amargo em massa crocante.",
  },
};

export function getSampleCategories(locale: Locale = "tr"): GuestCategory[] {
  const d = SAMPLE_DATA[locale] ?? SAMPLE_DATA.en;
  return [
    {
      id: "sample-signatures",
      name: d.catSignatures,
      items: [
        sample("sample-mojito", d.mojitoName, d.mojitoDesc, "16.00", "cocktail", ["SEFIN_SECIMI"], ["alkol"]),
        sample("sample-spritz", d.spritzName, d.spritzDesc, "18.00", "cocktail", ["POPULER", "YENI"], ["alkol"]),
      ],
      subcategories: [],
    },
    {
      id: "sample-cool",
      name: d.catCool,
      items: [],
      subcategories: [
        {
          id: "sample-soft",
          name: d.subSoft,
          items: [
            sample("sample-hibiscus", d.fizzName, d.fizzDesc, "11.00", "lemonade", ["VEGAN", "GLUTENSIZ"]),
            sample("sample-cooler", d.coolerName, d.coolerDesc, "12.00", "smoothie", ["VEJETARYEN"], ["sut"], false),
          ],
          groups: [],
        },
      ],
    },
    {
      id: "sample-share",
      name: d.catShare,
      items: [],
      subcategories: [
        {
          id: "sample-plates",
          name: d.subPlates,
          items: [
            sample("sample-burger", d.burgerName, d.burgerDesc, "19.00", "burger", ["POPULER"], ["gluten", "sut"]),
            sample("sample-salad", d.saladName, d.saladDesc, "22.00", "salad", ["VEJETARYEN"], ["sut", "gluten", "kuruyemis"]),
          ],
          groups: [],
        },
      ],
    },
    {
      id: "sample-sweet",
      name: d.catSweet,
      items: [
        sample("sample-tart", d.tartName, d.tartDesc, "13.00", "dessert", ["SEFIN_SECIMI"], ["gluten", "sut", "yumurta"]),
      ],
      subcategories: [],
    },
  ];
}

/** Shown until the outlet has its own dishes, so the studio is never an empty phone. */
export const SAMPLE_CATEGORIES: GuestCategory[] = getSampleCategories("tr");

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
  currency?: string;
}): { menu: GuestMenu; sample: boolean } {
  const categories = categoriesFromTree(input.nodes, input.locale);
  const sampleMenu = categories.length === 0;
  return {
    sample: sampleMenu,
    menu: {
      categories: sampleMenu ? getSampleCategories(input.locale ?? "tr") : categories,
      state: {
        outletId: "onizleme",
        hotelId: "onizleme",
        outletName: input.outletName,
        hotelName: input.hotelName,
        menuOpen: true,
        orderingOpen: false,
        pricesShown: input.design.options.showPrices,
        currency: input.currency ?? "EUR",
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
