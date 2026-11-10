// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getSelectionStore } from "@/modules/menu/ui/guest/selectionStore";

let n = 0;
const fresh = () => getSelectionStore(`t-${++n}`);

beforeEach(() => localStorage.clear());

describe("selectionStore lineId (MEN-2)", () => {
  it("aynı üründe farklı notlu satırlar ayrı lineId alır; adet/not/silme yalnız o satırı etkiler", () => {
    const store = fresh();
    store.getState().add({ menuNodeId: "m1", name: "Kebap", qty: 1 });
    store.getState().add({ menuNodeId: "m1", name: "Kebap", qty: 1, note: "acısız" });
    const [a, b] = store.getState().items;
    expect(a.lineId).not.toBe(b.lineId);
    store.getState().setQty(b.lineId, 3);
    store.getState().setItemNote(b.lineId, "az pişmiş");
    expect(store.getState().items.map((i) => [i.qty, i.note])).toEqual([[1, undefined], [3, "az pişmiş"]]);
    expect(store.getState().items[1].lineId).toBe(b.lineId);
    store.getState().remove(a.lineId);
    expect(store.getState().items.map((i) => i.lineId)).toEqual([b.lineId]);
  });

  it("lineId'siz eski kalıcı veri yüklenirken lineId alır", async () => {
    localStorage.setItem(
      "merit_selections_legacy",
      JSON.stringify({ state: { items: [{ menuNodeId: "m1", name: "Çay", qty: 2 }], note: "" }, version: 0 }),
    );
    const store = getSelectionStore("legacy");
    await store.persist.rehydrate();
    const [line] = store.getState().items;
    expect(line.lineId).toBeTruthy();
    expect(line.qty).toBe(2);
  });
});

describe("selectionStore reconcile (MEN-6)", () => {
  it("menüde olmayan/tükenen satırı çıkarır, ad ve fiyatı güncel menüden alır", () => {
    const store = fresh();
    store.getState().add({ menuNodeId: "m1", name: "Eski ad", qty: 1, unitPrice: "10.00" });
    store.getState().add({ menuNodeId: "m2", name: "Tükenen", qty: 1, unitPrice: "5.00" });
    store.getState().reconcile(new Map([["m1", { name: "Yeni ad", price: "12.00" }]]));
    const s = store.getState();
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ menuNodeId: "m1", name: "Yeni ad", unitPrice: "12.00" });
    expect(s.removedNames).toEqual(["Tükenen"]);
    s.dismissRemoved();
    expect(store.getState().removedNames).toEqual([]);
  });

  it("fiyat gizliyse unitPrice düşer; değişiklik yoksa durum aynı kalır", () => {
    const store = fresh();
    store.getState().add({ menuNodeId: "m1", name: "Çay", qty: 1, unitPrice: "3.00" });
    store.getState().reconcile(new Map([["m1", { name: "Çay" }]]));
    expect(store.getState().items[0].unitPrice).toBeUndefined();
    const before = store.getState();
    store.getState().reconcile(new Map([["m1", { name: "Çay" }]]));
    expect(store.getState()).toBe(before);
  });
});
