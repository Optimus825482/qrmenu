import { describe, expect, it } from "vitest";
import { treeLines } from "@/modules/core/jobTitles";

describe("görev ağacı çizgileri", () => {
  it("son alt görevde çizgi biter, kardeşi olanın çizgisi aşağı sürer", () => {
    // A > (B > (D, E), C) ; F is a second root
    const rows = [
      { id: "A", depth: 0 },
      { id: "B", depth: 1 },
      { id: "D", depth: 2 },
      { id: "E", depth: 2 },
      { id: "C", depth: 1 },
      { id: "F", depth: 0 },
    ];
    const lines = treeLines(rows);
    expect(lines.get("A")?.guides).toEqual([]);
    expect(lines.get("B")).toEqual({ guides: [], last: false });
    expect(lines.get("D")).toEqual({ guides: [true], last: false });
    expect(lines.get("E")).toEqual({ guides: [true], last: true });
    expect(lines.get("C")).toEqual({ guides: [], last: true });
  });
});
