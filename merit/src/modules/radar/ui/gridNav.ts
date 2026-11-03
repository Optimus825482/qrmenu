// Pure 2D grid navigation helper for irregular row lengths (spec 5.6, Task 9).

export type GridDims = {
  /** Number of columns in each row. */
  rows: readonly number[];
};

export type GridPos = { r: number; c: number };

export type GridNavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

/**
 * Computes the next `(r, c)` position inside a grid where rows may have different column counts.
 * Clamps column index when moving vertically into a shorter row, and stays in place at outer bounds.
 */
export function nextCell(dims: GridDims, pos: GridPos, key: GridNavKey): GridPos {
  const rowCount = dims.rows.length;
  if (rowCount === 0) return pos;
  const r = Math.max(0, Math.min(rowCount - 1, pos.r));
  const rowLen = Math.max(0, dims.rows[r] ?? 0);
  const c = rowLen > 0 ? Math.max(0, Math.min(rowLen - 1, pos.c)) : 0;

  switch (key) {
    case "ArrowLeft":
      return { r, c: Math.max(0, c - 1) };
    case "ArrowRight":
      return { r, c: rowLen > 0 ? Math.min(rowLen - 1, c + 1) : 0 };
    case "Home":
      return { r, c: 0 };
    case "End":
      return { r, c: rowLen > 0 ? rowLen - 1 : 0 };
    case "ArrowUp":
    case "ArrowDown": {
      const dir = key === "ArrowDown" ? 1 : -1;
      let nextR = r + dir;
      while (nextR >= 0 && nextR < rowCount && (dims.rows[nextR] ?? 0) === 0) {
        nextR += dir;
      }
      if (nextR < 0 || nextR >= rowCount) return { r, c };
      const nextLen = dims.rows[nextR] ?? 0;
      return { r: nextR, c: nextLen > 0 ? Math.min(c, nextLen - 1) : 0 };
    }
  }
}
