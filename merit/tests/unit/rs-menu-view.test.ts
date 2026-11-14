import { describe, expect, it } from "vitest";
import { branchIds, buildBranches, findItem, pathOf } from "@/app/(ops)/oda-servisi/menu/menuView";
import type { MenuTreeNode } from "@/modules/menu/server/menuTree";

let seq = 0;
function node(kind: MenuTreeNode["kind"], name: string, extra: Partial<MenuTreeNode> = {}, children: MenuTreeNode[] = []): MenuTreeNode {
  return {
    id: extra.id ?? `n${++seq}`,
    outletId: "o1",
    parentId: null,
    kind,
    name,
    detail: null,
    price: kind === "OGE" ? "10.00" : null,
    currency: "EUR",
    allergens: [],
    tags: [],
    isAvailable: true,
    isActive: true,
    sortOrder: 0,
    hasImage: false,
    imageUrl: null,
    imageUrls: [],
    translations: [],
    children,
    ...extra,
  };
}

const TREE: MenuTreeNode[] = [
  node("KATEGORI", "Yiyecekler", { id: "food" }, [
    node("OGE", "Çorba", { id: "soup" }),
    node("ALT_KATEGORI", "Izgaralar", { id: "grill" }, [
      node("OGE", "IZGARA KÖFTE", { id: "kofte", isAvailable: false }),
      node("OGE", "Tavuk Şiş", { id: "sis" }),
      node("GRUP", "Soslar", { id: "sauce" }, [node("OGE", "Barbekü", { id: "bbq", isActive: false })]),
    ]),
  ]),
  node("KATEGORI", "İçecekler", { id: "drinks" }, [node("OGE", "Ayran", { id: "ayran" })]),
  node("KATEGORI", "Kapalı", { id: "off", isActive: false }, [node("OGE", "Gizli", { id: "hidden" })]),
];

const ALL = { query: "", soldOutOnly: false };

describe("oda servisi menü ağacı (personel)", () => {
  it("pasif düğüm alt ağacıyla gizlenir, boş dal düşer, sayılar alt dalları kapsar", () => {
    const branches = buildBranches(TREE, ALL);
    expect(branches.map((b) => [b.name, b.itemCount, b.soldOutCount])).toEqual([
      ["Yiyecekler", 3, 1],
      ["İçecekler", 1, 0],
    ]);
    expect(branches[0].items.map((i) => i.name)).toEqual(["Çorba"]);
    // "Soslar" holds only an inactive item: the branch is not shown.
    expect(branches[0].branches.map((b) => [b.name, b.branches.length])).toEqual([["Izgaralar", 0]]);
    expect(branchIds(branches)).toEqual(["food", "grill", "drinks"]);
  });

  it("arama büyük/küçük ve ı/i ayrımı yapmaz", () => {
    const branches = buildBranches(TREE, { query: "izgara", soldOutOnly: false });
    expect(branches.map((b) => b.name)).toEqual(["Yiyecekler"]);
    expect(branches[0].branches[0].items.map((i) => i.id)).toEqual(["kofte"]);
    expect(buildBranches(TREE, { query: "yok böyle", soldOutOnly: false })).toEqual([]);
  });

  it("yalnız tükenenler", () => {
    const branches = buildBranches(TREE, { query: "", soldOutOnly: true });
    expect(branches.map((b) => [b.name, b.itemCount])).toEqual([["Yiyecekler", 1]]);
    expect(branches[0].items).toEqual([]);
  });

  it("ürün ve yolu bulunur; dal kimliği ürün sayılmaz", () => {
    expect(findItem(TREE, "kofte")?.name).toBe("IZGARA KÖFTE");
    expect(findItem(TREE, "grill")).toBeUndefined();
    expect(pathOf(TREE, "kofte")).toBe("Yiyecekler › Izgaralar");
    expect(pathOf(TREE, "nope")).toBeUndefined();
  });
});
