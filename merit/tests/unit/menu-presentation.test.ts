import { describe, expect, it } from "vitest";
import { curatedPhotoIds, isPriceList, PRICE_LIST_FROM_ITEMS } from "@/modules/menu/ui/guest/menuPresentation";
import type { GuestCategory, GuestItem } from "@/modules/menu/server/guestMenu";

const item = (id: string, over: Partial<GuestItem> = {}): GuestItem => ({
  id,
  name: id,
  imageUrl: `/uploads/${id}.webp`,
  allergens: [],
  tags: ["SEFIN_SECIMI"],
  isAvailable: true,
  ...over,
});
const category = (id: string, items: GuestItem[], sub: GuestItem[] = []): GuestCategory => ({
  id,
  name: id,
  items,
  subcategories: sub.length ? [{ id: `${id}-s`, name: "s", items: sub, groups: [] }] : [],
});

describe("curatedPhotoIds", () => {
  it("yalnız şefin seçimi ve görseli olanlar, en çok 3, kategori sırasıyla", () => {
    const menu = [
      category("a", [item("a1"), item("a2")], [item("a3")]),
      category("b", [item("b1"), item("b2")]),
    ];
    expect([...curatedPhotoIds(menu)]).toEqual(["a1", "a2", "a3"]);
  });

  it("görseli olmayan şef seçimi sayılmaz", () => {
    const menu = [category("a", [item("a1", { imageUrl: null }), item("a2")])];
    expect([...curatedPhotoIds(menu)]).toEqual(["a2"]);
  });

  it("etiketsiz veya yalnız POPULER etiketli ürün sayılmaz", () => {
    const menu = [category("a", [item("a1", { tags: [] }), item("a2", { tags: ["POPULER"] }), item("a3")])];
    expect([...curatedPhotoIds(menu)]).toEqual(["a3"]);
  });

  it("kategori yoksa boş küme; max parametresi uygulanır", () => {
    expect(curatedPhotoIds([]).size).toBe(0);
    const menu = [category("a", [item("a1"), item("a2"), item("a3")])];
    expect(curatedPhotoIds(menu, 2).size).toBe(2);
  });
});

describe("isPriceList", () => {
  const many = (n: number, over: Partial<GuestItem> = {}) => Array.from({ length: n }, (_, i) => item(`i${i}`, over));

  it("açıklamasız uzun liste (şişeler) fiyat listesidir, fotoğrafı olsa da", () => {
    expect(isPriceList(many(12))).toBe(true);
  });

  it("hiç fotoğrafı olmayan uzun liste fiyat listesidir, açıklaması olsa da", () => {
    expect(isPriceList(many(6, { imageUrl: null, detail: "taze" }))).toBe(true);
  });

  it("fotoğraflı ve açıklamalı yemekler kart olarak kalır", () => {
    expect(isPriceList(many(8, { detail: "ızgara" }))).toBe(false);
    expect(isPriceList([...many(7), item("x", { detail: "tek açıklama" })])).toBe(false);
  });

  it("kısa liste kart olarak kalır", () => {
    expect(isPriceList(many(PRICE_LIST_FROM_ITEMS - 1))).toBe(false);
    expect(isPriceList(many(PRICE_LIST_FROM_ITEMS))).toBe(true);
  });
});
