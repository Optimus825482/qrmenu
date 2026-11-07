import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP4001Xlsx, buildStandardXlsx } from "../../helpers/xlsx";

export const OCCUPANCY_ROOMS = { clash: "101", arrival: "102", departure: "103", inhouse: "104" } as const;
const headers = ["Room no", "Arrival", "Departure", "Adult", "Arr.Time", "Dep.Time"];
const date = (day: string, shift = 0) => {
  const value = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== day) throw new Error("Tarih yyyy-MM-dd olmalı");
  value.setUTCDate(value.getUTCDate() + shift);
  return value;
};

/** Synthetic PMS inputs. A=101 clash, B=102 arrival, C=103 departure, D=104 in-house. */
export async function makeOccupancyFiles(day: string, outDir: string): Promise<{ inhouse: string; arrivals: string; departures: string }> {
  await mkdir(outDir, { recursive: true });
  const files = { inhouse: path.join(outDir, "inhouse.xlsx"), arrivals: path.join(outDir, "arrivals.xlsx"), departures: path.join(outDir, "departures.xlsx") };
  await writeFile(files.inhouse, await buildStandardXlsx([
    ["104", date(day, -2), date(day, 3), 2, null, null],
    ["9999", date(day, -2), date(day, 3), 2, null, null],
  ], headers));
  await writeFile(files.arrivals, await buildStandardXlsx([
    ["101", date(day), date(day, 3), 2, "13:00", null],
    ["102", date(day), date(day, 3), 2, "14:00", null],
  ], headers));
  await writeFile(files.departures, await buildStandardXlsx([
    ["101", date(day, -2), date(day), 2, null, "11:00"],
    ["103", date(day, -2), date(day), 2, null, "12:00"],
  ], headers));
  return files;
}

export async function makeP4001File(day: string, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, "p4001-inhouse.xlsx");
  const [year, month, d] = day.split("-");
  await writeFile(file, await buildP4001Xlsx({
    reportLine: `Report Date: ${d}.${month}.${year}`,
    hotelName: "SENTETİK EĞİTİM OTELİ",
    rows: [["Örnek Misafir", "104", "STD", date(day, -2), date(day, 3), 2]],
  }));
  return file;
}
