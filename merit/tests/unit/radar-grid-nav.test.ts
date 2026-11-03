import { describe, expect, it } from "vitest";
import { nextCell } from "@/modules/radar/ui/gridNav";

describe("gridNav.nextCell", () => {
  const dims = { rows: [4, 4, 2] };

  it("clamps column when moving ArrowDown into a shorter row (1,3) -> (2,1)", () => {
    expect(nextCell(dims, { r: 1, c: 3 }, "ArrowDown")).toEqual({ r: 2, c: 1 });
  });

  it("stays in place on ArrowRight at the last column of a row", () => {
    expect(nextCell(dims, { r: 0, c: 3 }, "ArrowRight")).toEqual({ r: 0, c: 3 });
    expect(nextCell(dims, { r: 2, c: 1 }, "ArrowRight")).toEqual({ r: 2, c: 1 });
  });

  it("stays in place on ArrowLeft at column 0 and ArrowUp at row 0", () => {
    expect(nextCell(dims, { r: 0, c: 0 }, "ArrowLeft")).toEqual({ r: 0, c: 0 });
    expect(nextCell(dims, { r: 0, c: 2 }, "ArrowUp")).toEqual({ r: 0, c: 2 });
    expect(nextCell(dims, { r: 2, c: 1 }, "ArrowDown")).toEqual({ r: 2, c: 1 });
  });

  it("moves to first and last column of the current row on Home and End", () => {
    expect(nextCell(dims, { r: 1, c: 2 }, "Home")).toEqual({ r: 1, c: 0 });
    expect(nextCell(dims, { r: 1, c: 1 }, "End")).toEqual({ r: 1, c: 3 });
    expect(nextCell(dims, { r: 2, c: 0 }, "End")).toEqual({ r: 2, c: 1 });
  });

  it("skips empty rows when moving vertically", () => {
    const withEmpty = { rows: [3, 0, 2] };
    expect(nextCell(withEmpty, { r: 0, c: 2 }, "ArrowDown")).toEqual({ r: 2, c: 1 });
    expect(nextCell(withEmpty, { r: 2, c: 1 }, "ArrowUp")).toEqual({ r: 0, c: 1 });
  });
});
