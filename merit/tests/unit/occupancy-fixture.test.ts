import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { makeOccupancyFiles, makeP4001File } from "../fixtures/occupancy/make-occupancy";

describe("kabul doluluk dosyaları", () => {
  it("üç PMS dosyası, çakışma ve tanımsız oda ile P4001 başlığını üretir", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "merit-occupancy-"));
    try {
      const files = await makeOccupancyFiles("2026-11-07", dir);
      for (const [kind, count] of [["inhouse", 3], ["arrivals", 3], ["departures", 3]] as const) {
        const book = new ExcelJS.Workbook();
        await book.xlsx.readFile(files[kind]);
        expect(book.worksheets[0].rowCount).toBe(count);
        expect(book.worksheets[0].getRow(1).values).toContain("Dep.Time");
      }
      const book = new ExcelJS.Workbook();
      await book.xlsx.readFile(files.arrivals);
      expect(book.worksheets[0].getColumn(1).values).toContain("101");
      expect(book.worksheets[0].getColumn(1).values).toContain("102");
      await book.xlsx.readFile(files.inhouse);
      expect(book.worksheets[0].getColumn(1).values).toContain("104");
      expect(book.worksheets[0].getColumn(1).values).toContain("9999");
      await book.xlsx.readFile(await makeP4001File("2026-11-07", dir));
      expect(book.worksheets[0].getRow(8).values).toContain("R.No");
      expect(book.worksheets[0].getRow(10).values).toContain("104");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
