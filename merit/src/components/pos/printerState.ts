import type { PrinterState } from "./usePrinterStatus";

/** A printer that has been silent for longer than this counts as down. */
export const PRINTER_ONLINE_AFTER_MS = 90_000;

/** First state of a printer from its last ping (`lastSeenAt` / `lastStatus`); no ping yet = unknown. */
export function printerStateFromPing(
  printer: { lastSeenAt: Date | null; lastStatus: string | null } | null,
  now: number = Date.now(),
): PrinterState {
  if (!printer?.lastSeenAt) return "unknown";
  return printer.lastStatus === "OK" && now - printer.lastSeenAt.getTime() <= PRINTER_ONLINE_AFTER_MS ? "ok" : "error";
}
