import ExcelJS from "exceljs";

/** Cell values the generated workbooks carry (Date cells are written as real Excel dates). */
export type XlsxCell = string | number | Date | null;

const STANDARD_HEADERS = ["Name", "Room no", "R.Type", "Arrival", "Departure", "Adult"];

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function putRow(ws: ExcelJS.Worksheet, rowNo: number, cells: XlsxCell[]): void {
  const row = ws.getRow(rowNo);
  cells.forEach((v, i) => {
    if (v !== null) row.getCell(i + 1).value = v;
  });
}

/** Standard layout: header in row 1, one data row per entry (cells in header order). */
export async function buildStandardXlsx(rows: XlsxCell[][], headers: string[] = STANDARD_HEADERS): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  putRow(ws, 1, headers);
  rows.forEach((r, i) => putRow(ws, 2 + i, r));
  return toBuffer(wb);
}

/**
 * P4001 layout: hotel name (row 1), report title (row 2), header (row 8), report line (row 9),
 * data from row 10. `rows` are `[name, R.No, R.Typ, Arrival, Departure, Adl]`.
 */
export async function buildP4001Xlsx(opts: {
  reportLine: string;
  rows: XlsxCell[][];
  hotelName?: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("P4001");
  putRow(ws, 1, [opts.hotelName ?? "MERIT ROYAL DIAMOND"]);
  putRow(ws, 2, ["P4001 Guests in house"]);
  putRow(ws, 8, ["Name", "R.No", "R.Typ", "Arrival", "Departure", "Adl"]);
  putRow(ws, 9, [opts.reportLine]);
  opts.rows.forEach((r, i) => putRow(ws, 10 + i, r));
  return toBuffer(wb);
}
