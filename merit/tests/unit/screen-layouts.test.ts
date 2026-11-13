import { describe, expect, it } from "vitest";
import {
  blockStyle,
  defaultLayout,
  isDefaultLayout,
  layoutFor,
  layoutRows,
  layoutScreenFor,
  moveBlock,
  moveItem,
  normalizeLayout,
  SCREEN_LAYOUT_DEFS,
  screenLayoutsSchema,
  setBlockColumns,
  setBlockSize,
  setBlockStyle,
  setBlockTitle,
  setBlockVisible,
  setBlockWidth,
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
    expect(visibleItems(setBlockVisible(defaultLayout("komuta"), "hizliMinibar", false), "hizliMinibar")).toEqual([]);
  });

  it("width, size, columns and title survive a round trip and bad values fall back", () => {
    let layout = defaultLayout("kat");
    layout = setBlockWidth(layout, "ozet", "yarim");
    layout = setBlockSize(layout, "ozet", "buyuk");
    layout = setBlockColumns(layout, "ozet", 3);
    layout = setBlockTitle(layout, "katlar", "Katlarım");
    const loaded = normalizeLayout("kat", JSON.parse(JSON.stringify(layout)));
    expect(loaded).toEqual(layout);
    expect(isDefaultLayout("kat", loaded)).toBe(false);

    const repaired = normalizeLayout("kat", {
      blocks: [
        { id: "ozet", visible: true, columns: 7, title: "   " },
        { id: "ilerleme", visible: true, columns: 2 },
      ],
    });
    // 7 is not an offered count, "ilerleme" has no grid, a blank title is no title.
    expect(repaired.blocks[0]).toMatchObject({ columns: null, title: null, width: "tam", size: "normal" });
    expect(repaired.blocks[1]).toMatchObject({ columns: null });
    // A value outside the schema (unknown width) discards the stored layout as a whole.
    expect(normalizeLayout("kat", { blocks: [{ id: "ozet", visible: true, width: "dev" }] })).toEqual(defaultLayout("kat"));
  });

  it("two half-width blocks that follow each other share a row", () => {
    const ids = (layout: ReturnType<typeof defaultLayout>) => layoutRows(layout).map((row) => row.map((b) => b.id));
    // Built-in Komuta screen: the two lists sit side by side at the end.
    expect(ids(defaultLayout("komuta")).at(-1)).toEqual(["online", "akis"]);

    let layout = defaultLayout("kat");
    layout = setBlockWidth(layout, "ozet", "yarim");
    expect(ids(layout)).toEqual([["ozet"], ["ilerleme"], ["kritikStok"], ["katlar"]]);
    layout = setBlockWidth(layout, "ilerleme", "yarim");
    layout = setBlockWidth(layout, "kritikStok", "yarim");
    // A third half block starts a new row; hidden blocks take no part.
    expect(ids(layout)).toEqual([["ozet", "ilerleme"], ["kritikStok"], ["katlar"]]);
    expect(ids(setBlockVisible(layout, "ilerleme", false))).toEqual([["ozet", "kritikStok"], ["katlar"]]);
  });

  it("each operation offers its windows; extra ones start switched off", () => {
    const layout = defaultLayout("komuta");
    expect(visibleItems(layout, "hizliOutlet")).toEqual(["tanim", "menu", "tema", "masaqr"]);
    expect(visibleItems(setItemVisible(layout, "hizliOutlet", "yazicilar", true), "hizliOutlet")).toContain("yazicilar");
    for (const block of SCREEN_LAYOUT_DEFS.komuta.blocks.filter((b) => b.id.startsWith("hizli"))) {
      expect(block.items!.every((item) => item.app)).toBe(true);
    }
  });

  it("a layout saved with the old single quick-access block keeps its rows", () => {
    const layout = normalizeLayout("komuta", {
      blocks: [
        { id: "hizli", visible: true, items: [{ id: "minibar", visible: true }, { id: "outlet", visible: false }] },
        { id: "kpi", visible: true },
      ],
    });
    expect(layout.blocks.slice(0, 5).map((b) => [b.id, b.visible])).toEqual([
      ["hizliMinibar", true],
      ["hizliOutlet", false],
      ["hizliOda", true],
      ["hizliSistem", true],
      ["kpi", true],
    ]);
  });

  it("maps catalogue screens to the page they open", () => {
    expect(layoutScreenFor("MB-KAT")).toBe("kat");
    expect(layoutScreenFor("CR-KOM")).toBe("komuta");
    expect(layoutScreenFor("QS-KDS")).toBeNull();
    expect(layoutScreenFor(null)).toBeNull();
  });
});
