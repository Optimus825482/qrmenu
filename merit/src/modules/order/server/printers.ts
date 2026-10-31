import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import {
  conflictFromPrisma,
  isConflictError,
  parseInput,
  publishDefinition,
  withAdminTx,
} from "@/modules/core/server/admin/crud";

export type HeartbeatPrinter = { id: string; ok: boolean; message?: string };

const STATUS_MAX = 200;
const SCREEN = "QS-FIS";
/** A printer is online while its last heartbeat is at most this old and reported OK. */
const ONLINE_AFTER_MS = 90_000;
const INVALID = "Girilen bilgiler geçersiz";
const NAME_TAKEN = "Bu adda bir yazıcı zaten var";
const HAS_JOBS = "Bu yazıcının iş kayıtları var; silmek yerine pasife alın";
const NOT_FOUND = "Yazıcı bulunamadı";
const OUTLET_NOT_OURS = "Outlet bu otelin değil";
const PRINTER_NOT_OURS = "Yazıcı bu otelin değil";

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

/** One row of the Yazıcılar window: statics, live state and today's job counters. */
export type PrinterRow = {
  id: string;
  name: string;
  ip: string;
  port: number;
  codepage: string;
  paperWidth: number;
  /** The outlet the printer hangs on (`Printer.outletId`), not the receipt default. */
  outletId: string | null;
  outletName: string | null;
  isActive: boolean;
  lastSeenAt: Date | null;
  lastStatus: string | null;
  /** `lastSeenAt` within the last 90 s and `lastStatus` 'OK'. */
  online: boolean;
  /** Jobs waiting or printing (KUYRUKTA + BASILIYOR). */
  queued: number;
  /** Jobs that failed for good (HATA). */
  failed: number;
};

const SELECT = {
  id: true,
  hotelId: true,
  name: true,
  ip: true,
  port: true,
  codepage: true,
  paperWidth: true,
  outletId: true,
  isActive: true,
  lastSeenAt: true,
  lastStatus: true,
  outlet: { select: { name: true } },
} satisfies Prisma.PrinterSelect;

type PrinterWithOutlet = Prisma.PrinterGetPayload<{ select: typeof SELECT }>;

type JobCounts = { queued: number; failed: number };
const NO_JOBS: JobCounts = { queued: 0, failed: 0 };

/** KUYRUKTA+BASILIYOR → queued, HATA → failed, keyed by printer id (`db` = prisma or a tx). */
async function jobCounts(db: Pick<Prisma.TransactionClient, "printJob">, hotelId: string): Promise<Map<string, JobCounts>> {
  const groups = await db.printJob.groupBy({
    by: ["printerId", "status"],
    where: { hotelId, status: { in: ["KUYRUKTA", "BASILIYOR", "HATA"] } },
    _count: { _all: true },
  });
  const map = new Map<string, JobCounts>();
  for (const group of groups) {
    const entry = map.get(group.printerId) ?? { ...NO_JOBS };
    if (group.status === "HATA") entry.failed += group._count._all;
    else entry.queued += group._count._all;
    map.set(group.printerId, entry);
  }
  return map;
}

function toRow(printer: PrinterWithOutlet, counts: JobCounts = NO_JOBS): PrinterRow {
  const online =
    printer.lastSeenAt !== null &&
    printer.lastStatus === "OK" &&
    Date.now() - printer.lastSeenAt.getTime() <= ONLINE_AFTER_MS;
  return {
    id: printer.id,
    name: printer.name,
    ip: printer.ip,
    port: printer.port,
    codepage: printer.codepage,
    paperWidth: printer.paperWidth,
    outletId: printer.outletId,
    outletName: printer.outlet?.name ?? null,
    isActive: printer.isActive,
    lastSeenAt: printer.lastSeenAt,
    lastStatus: printer.lastStatus,
    online,
    queued: counts.queued,
    failed: counts.failed,
  };
}

/** Audit snapshots carry the row as JSON: the timestamp goes out as an ISO string. */
function auditSnapshot(printer: PrinterWithOutlet): Record<string, unknown> {
  const { outlet, lastSeenAt, ...rest } = printer;
  return { ...rest, outletName: outlet?.name ?? null, lastSeenAt: lastSeenAt?.toISOString() ?? null };
}

/** Form input: strings from the dialog, numbers from direct calls; both pass. */
export const printerSchema = z.object({
  name: z
    .string("Yazıcı adı gerekli")
    .trim()
    .min(1, "Yazıcı adı gerekli")
    .max(80, "En fazla 80 karakter olabilir"),
  ip: z.ipv4("Geçerli bir IPv4 adresi girin"),
  port: z.coerce
    .number("Port gerekli")
    .int("Port tam sayı olmalı")
    .min(1, "Port 1-65535 arası olmalı")
    .max(65535, "Port 1-65535 arası olmalı")
    .default(9100),
  codepage: z.literal("cp857").default("cp857"),
  paperWidth: z.coerce
    .number("Kâğıt genişliği gerekli")
    .refine((width) => width === 58 || width === 80, "Kâğıt genişliği 58 veya 80 mm olabilir")
    .default(80),
  /** `""` (the dialog's "Yok") clears the outlet link; absent leaves it untouched on update. */
  outletId: z.string().max(64).optional(),
});
export type PrinterInput = z.input<typeof printerSchema>;

const outletLink = (outletId: string | undefined): string | null | undefined =>
  outletId === undefined ? undefined : outletId === "" ? null : outletId;

/** The outlet, when the input names one, must belong to the printer's hotel. */
async function assertOutletInHotel(
  db: Pick<Prisma.TransactionClient, "outlet">,
  hotelId: string,
  outletId: string,
): Promise<void> {
  const outlet = await db.outlet.findFirst({ where: { id: outletId, hotelId }, select: { id: true } });
  if (!outlet) {
    throw new DomainError("VALIDATION", INVALID, { fieldErrors: { outletId: [OUTLET_NOT_OURS] } });
  }
}

/** The hotel's printers for the Yazıcılar window (`QS-FIS V`), oldest first. */
export async function list(ctx: Ctx, hotelId: string): Promise<PrinterRow[]> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const [rows, counts] = await Promise.all([
    prisma.printer.findMany({
      where: { hotelId },
      select: SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    jobCounts(prisma, hotelId),
  ]);
  return rows.map((row) => toRow(row, counts.get(row.id) ?? NO_JOBS));
}

export async function create(ctx: Ctx, hotelId: string, raw: PrinterInput): Promise<PrinterRow> {
  const input = parseInput(printerSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      const outletId = outletLink(input.outletId);
      if (outletId) await assertOutletInHotel(tx, hotelId, outletId);
      const created = await tx.printer.create({
        data: {
          hotelId,
          name: input.name,
          ip: input.ip,
          port: input.port,
          codepage: input.codepage,
          paperWidth: input.paperWidth,
          ...(outletId ? { outletId } : {}),
        },
        select: SELECT,
      });
      const row = toRow(created, (await jobCounts(tx, hotelId)).get(created.id) ?? NO_JOBS);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "PRINTER_CREATE",
        entity: "Printer",
        entityId: row.id,
        after: auditSnapshot(created),
      });
      await publishDefinition(tx, { hotelId, entity: "printer", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    // The message needs a query: only pay for it when a constraint actually tripped.
    if (!isConflictError(error)) throw error;
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

async function patchById(
  ctx: Ctx,
  id: string,
  action: string,
  change: (before: PrinterWithOutlet) => Prisma.PrinterUpdateInput | undefined,
): Promise<PrinterRow> {
  const found = await prisma.printer.findUnique({ where: { id }, select: { hotelId: true } });
  if (!found) throw new DomainError("NOT_FOUND", NOT_FOUND);
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: found.hotelId }, async (tx) => {
    const before = await tx.printer.findFirst({ where: { id, hotelId: found.hotelId }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
    const data = change(before);
    if (!data) return toRow(before, (await jobCounts(tx, found.hotelId)).get(id) ?? NO_JOBS);
    const updated = await tx.printer.update({ where: { id }, data, select: SELECT });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: found.hotelId,
      action,
      entity: "Printer",
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(updated),
    });
    await publishDefinition(tx, { hotelId: found.hotelId, entity: "printer", id, op: "update" });
    return toRow(updated, (await jobCounts(tx, found.hotelId)).get(id) ?? NO_JOBS);
  });
}

/** Replaces the editable fields (name, ip, port, codepage, paperWidth, outlet). */
export async function update(ctx: Ctx, id: string, raw: PrinterInput): Promise<PrinterRow> {
  const input = parseInput(printerSchema, raw);
  const found = await prisma.printer.findUnique({ where: { id }, select: { hotelId: true } });
  if (!found) throw new DomainError("NOT_FOUND", NOT_FOUND);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: found.hotelId }, async (tx) => {
      const before = await tx.printer.findFirst({ where: { id, hotelId: found.hotelId }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
      const outletId = outletLink(input.outletId);
      if (outletId) await assertOutletInHotel(tx, found.hotelId, outletId);
      const updated = await tx.printer.update({
        where: { id },
        data: {
          name: input.name,
          ip: input.ip,
          port: input.port,
          codepage: input.codepage,
          paperWidth: input.paperWidth,
          ...(outletId !== undefined ? { outletId } : {}),
        },
        select: SELECT,
      });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: found.hotelId,
        action: "PRINTER_UPDATE",
        entity: "Printer",
        entityId: id,
        before: auditSnapshot(before),
        after: auditSnapshot(updated),
      });
      await publishDefinition(tx, { hotelId: found.hotelId, entity: "printer", id, op: "update" });
      return toRow(updated, (await jobCounts(tx, found.hotelId)).get(id) ?? NO_JOBS);
    });
  } catch (error) {
    if (!isConflictError(error)) throw error;
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

/** The grid's "pasif/aktif" switch: a dead printer stays listed but stops receiving pings. */
export function setActive(ctx: Ctx, id: string, isActive: boolean): Promise<PrinterRow> {
  return patchById(ctx, id, "PRINTER_SET_ACTIVE", (before) => {
    return before.isActive === isActive ? undefined : { isActive };
  });
}

/**
 * Delete: refused while print jobs reference the printer (audit history must stay readable);
 * deactivate instead. `outlet.printerId` and `printer.outletId` clear themselves (SetNull).
 */
export async function remove(ctx: Ctx, id: string): Promise<void> {
  const found = await prisma.printer.findUnique({ where: { id }, select: { hotelId: true } });
  if (!found) throw new DomainError("NOT_FOUND", NOT_FOUND);
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: found.hotelId }, async (tx) => {
      const before = await tx.printer.findFirst({ where: { id, hotelId: found.hotelId }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
      const jobs = await tx.printJob.count({ where: { printerId: id } });
      if (jobs > 0) throw new DomainError("CONFLICT", HAS_JOBS);
      await tx.printer.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: found.hotelId,
        action: "PRINTER_DELETE",
        entity: "Printer",
        entityId: id,
        before: auditSnapshot(before),
      });
      await publishDefinition(tx, { hotelId: found.hotelId, entity: "printer", id, op: "delete" });
    });
  } catch (error) {
    // A job created between the count and the delete trips the foreign key.
    conflictFromPrisma(error, HAS_JOBS);
  }
}

/**
 * The outlet's default receipt printer (`Outlet.printerId`). A printer may only be picked from
 * the outlet's own hotel; `null` clears the assignment.
 */
export async function setOutletDefault(ctx: Ctx, outletId: string, printerId: string | null): Promise<void> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: outlet.hotelId }, async (tx) => {
    if (printerId !== null) {
      const printer = await tx.printer.findFirst({
        where: { id: printerId, hotelId: outlet.hotelId, isActive: true },
        select: { id: true },
      });
      if (!printer) {
        throw new DomainError("VALIDATION", INVALID, { fieldErrors: { printerId: [PRINTER_NOT_OURS] } });
      }
    }
    const orderingOutlet = await tx.outlet.findFirst({
      where: { id: outletId, hotelId: outlet.hotelId, hasOrdering: true },
      select: { id: true },
    });
    if (!orderingOutlet) {
      throw new DomainError("VALIDATION", INVALID, { fieldErrors: { outletId: ["Outlet sipariş almıyor"] } });
    }
    await tx.outlet.update({ where: { id: outletId }, data: { printerId } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: outlet.hotelId,
      action: "PRINTER_SET_OUTLET_DEFAULT",
      entity: "Outlet",
      entityId: outletId,
      after: { printerId },
    });
    // The printer window owns this panel: refresh its list too.
    await publishDefinition(tx, {
      hotelId: outlet.hotelId,
      entity: "printer",
      id: printerId ?? outletId,
      op: "update",
      extra: { outletId },
    });
  });
}

/** An ordering outlet of the window's hotel and its current default printer (the bottom panel). */
export type OrderingOutlet = { id: string; name: string; printerId: string | null };

export async function listOrderingOutlets(ctx: Ctx, hotelId: string): Promise<OrderingOutlet[]> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  return prisma.outlet.findMany({
    where: { hotelId, hasOrdering: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, printerId: true },
  });
}

export const printers = {
  heartbeat,
  listActive,
  list,
  create,
  update,
  setActive,
  delete: remove,
  setOutletDefault,
  listOrderingOutlets,
};

export { remove as delete };
