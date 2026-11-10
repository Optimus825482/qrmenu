import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Room QR codes that are printed on the cards in the rooms (sent to the print shop on 10.11.2026,
 * address https://qrmenu.merithotels.com/q/<code>). They are permanent: a room whose current code
 * is its printed code can never get a new one, because the card in the room would stop working.
 * Shipped with the app (Dockerfile copies `assets/`).
 */
const FILE = path.join(process.cwd(), "assets", "qr-templates", "basili-oda-kodlari.json");

export type PrintedRoomCodes = {
  printedAt: string;
  baseUrl: string;
  /** hotel code → room number → code */
  hotels: Record<string, Record<string, string>>;
};

let cached: PrintedRoomCodes | undefined;

export function loadPrintedRoomCodes(): PrintedRoomCodes {
  cached ??= JSON.parse(readFileSync(FILE, "utf8")) as PrintedRoomCodes;
  return cached;
}

/** The printed code of a room, if a card was printed for it. */
export function printedCodeOf(hotelCode: string, roomNumber: string): string | undefined {
  return loadPrintedRoomCodes().hotels[hotelCode.toUpperCase()]?.[roomNumber];
}

/** Whether `token` is the code printed on this room's card (and so must stay as it is). */
export function isPrintedRoomCode(hotelCode: string, roomNumber: string, token: string | null): boolean {
  return token !== null && printedCodeOf(hotelCode, roomNumber) === token;
}

export const PRINTED_CODE_LOCKED = "Bu odanın QR kodu basılı oda kartında kullanılıyor; değiştirilemez";
