import { describe, expect, it } from "vitest";
import {
  blockStyle,
  defaultLayout,
  isDefaultLayout,
  layoutFor,
  layoutScreenFor,
  moveBlock,
  moveItem,
  normalizeLayout,
  SCREEN_LAYOUT_DEFS,
  screenLayoutsSchema,
  setBlockStyle,
  setBlockVisible,
  setItemVisible,
  visibleBlocks,
  visibleItems,
} from "@/modules/core/screenLayouts";

describe("screen layouts", () => {
  it("nothing stored gives every block and item, visible, in definition order", () => {
    const layout = defaultLayout("kat");
    expect(layout.blocks.map((b) => b.id)).toEqual(SCREEN_LAYOUT_DEFS.kat.blocks.map((b) => b.id));
    expect(layout.blocks.every((b) => b.visible)).toBe(true);
    expect(visibleItems(layout, "ozet")).toEqual(["toplam", "tamamlanan", "bekleyen", "dnd", "cakisma"]);
    expect(blockStyle(layout, "katlar")).toBe("kart");
    expect(isDefaultLayout("kat", layout)).toBe(true);
  });

  it("an edited layout survives a save and load round trip", () => {
    let layout = defaultLayout("kat");
    layout = moveBlock(layout, "katlar", -1);
    layout = setBlockVisible(layout, "ilerleme", false);
    layout = setBlockStyle(layout, "ozet", "serit");
    layout = setItemVisible(layout, "ozet", "cakisma", false);
    layout = moveItem(layout, "ozet", "bekleyen", -1);
    const stored = screenLayoutsSchema.parse(JSON.parse(JSON.stringify({ roles: { "R-KAT": { kat: layout } } })));
    const loaded = layoutFor(stored, "R-KAT", "kat");
    expect(loaded).toEqual(layout);
    expect(visibleBlocks(loaded).map((b) => b.id)).toEqual(["ozet", "katlar", "kritikStok"]);
    expect(visibleItems(loaded, "ozet")).toEqual(["toplam", "bekleyen", "tamamlanan", "dnd"]);
    expect(blockStyle(loaded, "ozet")).toBe("serit");
    expect(isDefaultLayout("kat", loaded)).toBe(false);
    // Another role, and a role with nothing stored, keep the built-in screen.
    expect(layoutFor(stored, "R-DEP", "kat")).toEqual(defaultLayout("kat"));
    expect(layoutFor(stored, undefined, "kat")).toEqual(defaultLayout("kat"));
  });

  it("repairs a stale or hand-edited layout instead of trusting it", () => {
    const layout = normalizeLayout("kat", {
      blocks: [
        { id: "silinmis-blok", visible: true },
        { id: "katlar", visible: false, style: "yok-boyle-stil" },
        { id: "ozet", visible: true, items: [{ id: "toplam", visible: false }, { id: "hayalet", visible: true }] },
      ],
    });
    // Unknown block dropped, blocks added since appended, required block forced visible, bad style → default.
    expect(layout.blocks.map((b) => b.id)).toEqual(["katlar", "ozet", "ilerleme", "kritikStok"]);
    expect(layout.blocks[0]).toMatchObject({ visible: true, style: "kart" });
    expect(visibleItems(layout, "ozet")).toEqual(["tamamlanan", "bekleyen", "dnd", "cakisma"]);
    expect(normalizeLayout("depo", "çöp")).toEqual(defaultLayout("depo"));
  });

  it("never leaves a visible block with every part hidden", () => {
    const layout = normalizeLayout("depo", {
      blocks: [{ id: "kpi", visible: true, items: ["doluluk", "talep", "kritik", "dnd"].map((id) => ({ id, visible: false })) }],
    });
    expect(visibleItems(layout, "kpi")).toEqual(["doluluk"]);
  });

  it("a hidden block shows none of its parts", () => {
    expect(visibleItems(setBlockVisible(defaultLayout("komuta"), "hizli", false), "hizli")).toEqual([]);
  });

  it("maps catalogue screens to the page they open", () => {
    expect(layoutScreenFor("MB-KAT")).toBe("kat");
    expect(layoutScreenFor("CR-KOM")).toBe("komuta");
    expect(layoutScreenFor("QS-KDS")).toBeNull();
    expect(layoutScreenFor(null)).toBeNull();
  });
});
