import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";

export type HeartbeatPrinter = { id: string; ok: boolean; message?: string };

const STATUS_MAX = 200;

/**
 * Gateway heartbeat: stamps `lastSeenAt` and `lastStatus` ('OK' or the error message) of the
 * hotel's own printers and publishes `printer.status` whenever a printer's ok-state flips (the
 * first report included). Unknown ids (other hotels, deleted printers) are ignored.
 */
async function heartbeat(hotelCode: string, printers: HeartbeatPrinter[]): Promise<void> {
  const hotel = await prisma.hotel.findUnique({ where: { code: hotelCode }, select: { id: true } });
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
  const updates = (Array.isArray(printers) ? printers : []).filter(
    (p): p is HeartbeatPrinter =>
      typeof p?.id === "string" && p.id.length > 0 && typeof p?.ok === "boolean",
  );
  if (updates.length === 0) return;
  const known = await prisma.printer.findMany({
    where: { id: { in: updates.map((p) => p.id) }, hotelId: hotel.id },
    select: { id: true, lastStatus: true },
  });
  const previous = new Map(known.map((p) => [p.id, p.lastStatus]));
  await prisma.$transaction(async (tx) => {
    for (const p of updates) {
      if (!previous.has(p.id)) continue;
      const status = (p.ok ? "OK" : p.message?.trim() || "HATA").slice(0, STATUS_MAX);
      await tx.printer.update({
        where: { id: p.id },
        data: { lastSeenAt: new Date(), lastStatus: status },
      });
      if ((previous.get(p.id) === "OK") !== p.ok) {
        await publish({ type: "printer.status", hotelId: hotel.id, payload: { printerId: p.id, ok: p.ok } }, tx);
      }
    }
  });
}

/** The hotel's active printers — the gateway pings exactly these (`heartbeat` route answer). */
async function listActive(hotelCode: string): Promise<{ id: string; ip: string; port: number }[]> {
  const hotel = await prisma.hotel.findUnique({ where: { code: hotelCode }, select: { id: true } });
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
  return prisma.printer.findMany({
    where: { hotelId: hotel.id, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, ip: true, port: true },
  });
}

export const printers = { heartbeat, listActive };
