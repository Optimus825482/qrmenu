import type { OutletType } from "@/generated/prisma/client";

/** [tr, en, de, ru, ar] */
export type Names5 = [string, string, string, string, string];

export interface DemoItem {
  n: Names5;
  price: number;
  allergens?: string[];
  tags?: string[];
  /** File under public/menu-samples (without extension); omitted = photo-less badge. */
  image?: string;
  soldOut?: boolean;
}

export interface DemoCategory {
  n: Names5;
  items: DemoItem[];
}

export interface DemoOutlet {
  name: string;
  type: OutletType;
  menu: DemoCategory[];
}

export const TRANSLATION_LANGS = ["en", "de", "ru", "ar"] as const;

/** Training outlets of the ROYAL hotel (the room service outlet comes from the base seed). */
export const DEMO_OUTLETS: DemoOutlet[] = [
  {
    name: "Havuz Bar",
    type: "HAVUZ",
    menu: [
      {
        n: ["İçecekler", "Drinks", "Getränke", "Напитки", "المشروبات"],
        items: [
          { n: ["Limonata", "Lemonade", "Limonade", "Лимонад", "عصير الليمون"], price: 4.5, image: "coffee", tags: ["soğuk"] },
          { n: ["Ayran", "Ayran (yoghurt drink)", "Ayran (Joghurtgetränk)", "Айран", "عيران"], price: 3, allergens: ["süt"], soldOut: true },
        ],
      },
      {
        n: ["Kokteyller", "Cocktails", "Cocktails", "Коктейли", "الكوكتيلات"],
        items: [{ n: ["Mojito", "Mojito", "Mojito", "Мохито", "موخيتو"], price: 9, image: "cocktail", allergens: ["alkol"] }],
      },
      {
        n: ["Atıştırmalık", "Snacks", "Snacks", "Закуски", "وجبات خفيفة"],
        items: [
          { n: ["Club Sandviç", "Club Sandwich", "Club Sandwich", "Клаб-сэндвич", "كلوب ساندويتش"], price: 11, image: "burger", allergens: ["gluten", "yumurta"] },
          { n: ["Patates Kızartması", "French Fries", "Pommes frites", "Картофель фри", "بطاطس مقلية"], price: 5 },
        ],
      },
      {
        n: ["Tatlılar", "Desserts", "Desserts", "Десерты", "الحلويات"],
        items: [{ n: ["Dondurma", "Ice Cream", "Eis", "Мороженое", "آيس كريم"], price: 4, image: "dessert", allergens: ["süt"] }],
      },
    ],
  },
  {
    name: "Beach Bar",
    type: "SAHIL",
    menu: [
      {
        n: ["Kokteyller", "Cocktails", "Cocktails", "Коктейли", "الكوكتيلات"],
        items: [
          { n: ["Piña Colada", "Piña Colada", "Piña Colada", "Пинья колада", "بينا كولادا"], price: 9.5, image: "cocktail", allergens: ["alkol"] },
          { n: ["Aperol Spritz", "Aperol Spritz", "Aperol Spritz", "Апероль шприц", "أبيرول سبريتز"], price: 9, allergens: ["alkol", "sülfit"] },
        ],
      },
      {
        n: ["Atıştırmalık", "Snacks", "Snacks", "Закуски", "وجبات خفيفة"],
        items: [
          { n: ["Meyve Tabağı", "Fruit Plate", "Obstteller", "Фруктовая тарелка", "طبق فواكه"], price: 8 },
          { n: ["Nachos", "Nachos", "Nachos", "Начос", "ناتشوز"], price: 7, allergens: ["süt"] },
        ],
      },
    ],
  },
  {
    name: "Ana Restoran",
    type: "SALON",
    menu: [
      {
        n: ["Ana Yemekler", "Main Courses", "Hauptgerichte", "Основные блюда", "الأطباق الرئيسية"],
        items: [
          { n: ["Izgara Levrek", "Grilled Sea Bass", "Gegrillter Wolfsbarsch", "Лаврак на гриле", "سمك القاروص المشوي"], price: 18, allergens: ["balık"] },
          { n: ["Tavuk Şiş", "Chicken Skewer", "Hähnchenspieß", "Куриный шашлык", "شيش دجاج"], price: 14 },
        ],
      },
      {
        n: ["Tatlılar", "Desserts", "Desserts", "Десерты", "الحلويات"],
        items: [
          { n: ["Baklava", "Baklava", "Baklava", "Пахлава", "بقلاوة"], price: 6, allergens: ["gluten", "fındık"] },
          { n: ["Sütlaç", "Rice Pudding", "Milchreis", "Рисовый пудинг", "أرز بالحليب"], price: 5, allergens: ["süt"] },
        ],
      },
    ],
  },
];

/** Room service menu: 8 items. */
export const DEMO_ROOM_SERVICE_MENU: DemoCategory[] = [
  {
    n: ["İçecekler", "Drinks", "Getränke", "Напитки", "المشروبات"],
    items: [
      { n: ["Çay", "Tea", "Tee", "Чай", "شاي"], price: 2.5 },
      { n: ["Türk Kahvesi", "Turkish Coffee", "Türkischer Kaffee", "Турецкий кофе", "قهوة تركية"], price: 3.5, image: "coffee" },
    ],
  },
  {
    n: ["Yemekler", "Meals", "Gerichte", "Блюда", "الوجبات"],
    items: [
      { n: ["Club Sandviç", "Club Sandwich", "Club Sandwich", "Клаб-сэндвич", "كلوب ساندويتش"], price: 12, image: "burger", allergens: ["gluten", "yumurta"] },
      { n: ["Cheeseburger", "Cheeseburger", "Cheeseburger", "Чизбургер", "تشيزبرغر"], price: 13, image: "burger", allergens: ["gluten", "süt"] },
      { n: ["Sezar Salata", "Caesar Salad", "Caesar Salat", "Салат Цезарь", "سلطة سيزر"], price: 10, allergens: ["yumurta", "balık"] },
      { n: ["Margherita Pizza", "Margherita Pizza", "Pizza Margherita", "Пицца Маргарита", "بيتزا مارغريتا"], price: 12, allergens: ["gluten", "süt"] },
      { n: ["Mercimek Çorbası", "Lentil Soup", "Linsensuppe", "Чечевичный суп", "شوربة عدس"], price: 6 },
    ],
  },
  {
    n: ["Tatlılar", "Desserts", "Desserts", "Десерты", "الحلويات"],
    items: [{ n: ["Cheesecake", "Cheesecake", "Käsekuchen", "Чизкейк", "تشيز كيك"], price: 7, image: "dessert", allergens: ["gluten", "süt", "yumurta"] }],
  },
];
