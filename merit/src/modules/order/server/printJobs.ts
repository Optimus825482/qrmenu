import type { Order, Prisma, PrintJob, PrintJobStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { businessDate, businessDateStart } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { onlineAt, outletAllowed } from "./approvals";
import { formatReceiptTime, receipt, type ReceiptPayload } from "./receipt";

const MAX_ATTEMPTS = 3;
const STALE_AFTER_MS = 60_000;
const DEFAULT_CLAIM_LIMIT = 10;
const MAX_CLAIM_LIMIT = 50;
const ERROR_MAX = 500;

export type ReportResult = { ok: true } | { ok: false; error: string };

export type ClaimedJob = {
  id: string;
  kind: "FIS" | "TEST";
  payload: Prisma.JsonValue;
  printer: { id: string; ip: string; port: number; codepage: string; paperWidth: number };
};

const cashiers = (tx: Prisma.TransactionClient, outletId: string): Promise<string[]> =>
  onlineAt(tx, outletId, ["R-KAS"]);

/**
 * The printer of an order: the outlet's default (`Outlet.printerId`), else the hotel-wide first
 * active printer (`outletId null`). No fallback across outlets otherwise.
 */
async function printerFor(
  tx: Prisma.TransactionClient,
  order: Pick<Order, "outletId" | "hotelId">,
) {
  const outlet = await tx.outlet.findUniqueOrThrow({
    where: { id: order.outletId },
    select: { printerId: true },
  });
  if (outlet.printerId) {
    const printer = await tx.printer.findFirst({ where: { id: outlet.printerId, isActive: true } });
    if (printer) return printer;
  }
  return tx.printer.findFirst({
    where: { hotelId: order.hotelId, outletId: null, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/**
 * Creates the FIS print job of an order inside the caller's transaction. Without a printer no job
 * is created: `print.failed` (reason YAZICI_YOK) is published and the outlet's online cashiers get
 * ONE `print.noPrinter` notification per outlet per business day (a dead printer must not spam).
 */
async function createReceiptJob(
  tx: Prisma.TransactionClient,
  order: Pick<Order, "id" | "hotelId" | "outletId">,
): Promise<PrintJob | null> {
  const printer = await printerFor(tx, order);
  if (!printer) {
    await publish(
      {
        type: "print.failed",
        hotelId: order.hotelId,
        outletId: order.outletId,
        payload: { orderId: order.id, reason: "YAZICI_YOK" },
      },
      tx,
    );
    const dayStart = businessDateStart(businessDate());
    // Serialize the check + insert so concurrent approvals emit only one daily warning.
    await tx.$queryRaw`SELECT 1 WHERE pg_advisory_xact_lock(hashtext(${'print.noPrinter:' + order.outletId}), hashtext(${dayStart.toISOString().slice(0, 10)})) IS NULL`;
    const already = await tx.notification.findFirst({
      // Notifications carry no outlet column: the outlet is encoded in refType/refId.
      where: { type: "print.noPrinter", refType: "Outlet", refId: order.outletId, createdAt: { gte: dayStart } },
      select: { id: true },
    });
    if (!already) {
      await notify(
        {
          recipients: await cashiers(tx, order.outletId),
          type: "print.noPrinter",
          title: "Yazıcı bulunamadı",
          body: "Fiş yazdırılmadı: outlet veya otel için aktif bir yazıcı tanımlı değil",
          refType: "Outlet",
          refId: order.outletId,
        },
        tx,
      );
    }
    return null;
  }
  const payload = await receipt.build(tx, order.id);
  const job = await tx.printJob.create({
    data: {
      hotelId: order.hotelId,
      printerId: printer.id,
      orderId: order.id,
      kind: "FIS",
      payload: payload as Prisma.InputJsonValue,
    },
  });
  await publish(
    {
      type: "print.queued",
      hotelId: order.hotelId,
      outletId: order.outletId,
      payload: { jobId: job.id, orderId: order.id, printerId: printer.id },
    },
    tx,
  );
  return job;
}

/** Approval-hook shape (`orders.transition`); a no-printer outlet answers with print.failed. */
async function enqueueReceipt(tx: Prisma.TransactionClient, order: Order): Promise<void> {
  await createReceiptJob(tx, order);
}

/** Test receipt of one printer (Task 10 window and cashier page send it). */
async function enqueueTest(ctx: Ctx, printerId: string): Promise<PrintJob> {
  const printer = await prisma.printer.findUnique({ where: { id: printerId } });
  if (!printer || !ctx.hotelIds.includes(printer.hotelId)) {
    throw new DomainError("NOT_FOUND", "Yazıcı bulunamadı");
  }
  await assertCan(ctx, "QS-FIS", "D", printer.hotelId);
  const hotel = await prisma.hotel.findUniqueOrThrow({ where: { id: printer.hotelId }, select: { name: true } });
  const payload: ReceiptPayload = {
    v: 1,
    header: { hotel: hotel.name, outlet: "TEST" },
    orderNo: 0,
    table: "-",
    at: formatReceiptTime(new Date()),
    items: [{ name: "Test fişi", qty: 1 }],
    pricesShown: false,
    footer: ["Merit OS"],
  };
  return prisma.$transaction(async (tx) => {
    const job = await tx.printJob.create({
      data: {
        hotelId: printer.hotelId,
        printerId: printer.id,
        kind: "TEST",
        payload: payload as Prisma.InputJsonValue,
      },
    });
    await publish(
      { type: "print.queued", hotelId: printer.hotelId, payload: { jobId: job.id, printerId: printer.id } },
      tx,
    );
    return job;
  });
}

/** Prints an existing order's receipt again (`QS-FIS O`); audited. */
async function reprint(ctx: Ctx, orderId: string): Promise<PrintJob | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !ctx.hotelIds.includes(order.hotelId)) {
    throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
  }
  if (!outletAllowed(ctx, order.outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  await assertCan(ctx, "QS-FIS", "O", order.hotelId);
  return prisma.$transaction(async (tx) => {
    const job = await createReceiptJob(tx, order);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: order.hotelId,
      action: "PRINT_REPRINT",
      entity: "Order",
      entityId: order.id,
      after: { jobId: job?.id ?? null },
    });
    return job;
  });
}

/**
 * Atomically hands the hotel's queued jobs to one gateway: a single UPDATE over
 * `FOR UPDATE SKIP LOCKED`, so concurrent pollers never take the same job.
 */
async function claim(hotelCode: string, limit = DEFAULT_CLAIM_LIMIT): Promise<ClaimedJob[]> {
  const hotel = await prisma.hotel.findUnique({ where: { code: hotelCode }, select: { id: true } });
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
  const take = Math.min(MAX_CLAIM_LIMIT, Math.max(1, Math.trunc(limit) || DEFAULT_CLAIM_LIMIT));
  const rows = await prisma.$queryRaw<{
    id: string;
    kind: "FIS" | "TEST";
    payload: Prisma.JsonValue;
    printer_id: string;
  }[]>`
    UPDATE print_jobs
    SET status = 'BASILIYOR', started_at = now(), attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT pj.id FROM print_jobs pj
      WHERE pj.hotel_id = ${hotel.id} AND pj.status = 'KUYRUKTA'
      ORDER BY pj.created_at
      LIMIT ${take}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, kind, payload, printer_id`;
  if (rows.length === 0) return [];
  const printers = await prisma.printer.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.printer_id))] } },
    select: { id: true, ip: true, port: true, codepage: true, paperWidth: true },
  });
  const byId = new Map(printers.map((p) => [p.id, p]));
  return rows.map((r) => {
    const printer = byId.get(r.printer_id);
    if (!printer) throw new DomainError("NOT_FOUND", "Yazıcı bulunamadı");
    return {
      id: r.id,
      kind: r.kind,
      payload: r.payload,
      printer: {
        id: printer.id,
        ip: printer.ip,
        port: printer.port,
        codepage: printer.codepage,
        paperWidth: printer.paperWidth,
      },
    };
  });
}

/**
 * Gateway report of one attempt. Success → BASILDI. Failure: before the third attempt the job goes
 * back to KUYRUKTA (error kept); from the third on it fails for good, with ONE cashier
 * notification per job (`refId` = job id, deduped) and a `print.failed` event.
 */
async function report(jobId: string, result: ReportResult): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      { id: string; attempts: number; status: PrintJobStatus; hotel_id: string; order_id: string | null; printer_id: string }[]
    >`SELECT id, attempts, status, hotel_id, order_id, printer_id FROM print_jobs WHERE id = ${jobId} FOR UPDATE`;
    if (locked.length === 0) throw new DomainError("NOT_FOUND", "Baskı işi bulunamadı");
    const job = locked[0];
    if (job.status !== "BASILIYOR") throw new DomainError("CONFLICT", "Baskı işi artık raporlanamaz");
    if (result.ok) {
      await tx.printJob.update({
        where: { id: jobId },
        data: { status: "BASILDI", printedAt: new Date(), error: null },
      });
      await publish(
        {
          type: "print.printed",
          hotelId: job.hotel_id,
          payload: { jobId, orderId: job.order_id, printerId: job.printer_id },
        },
        tx,
      );
      return;
    }
    const error = result.error.slice(0, ERROR_MAX);
    if (job.attempts < MAX_ATTEMPTS) {
      await tx.printJob.update({ where: { id: jobId }, data: { status: "KUYRUKTA", error } });
      return;
    }
    await tx.printJob.update({ where: { id: jobId }, data: { status: "HATA", error } });
    await publish(
      {
        type: "print.failed",
        hotelId: job.hotel_id,
        payload: { jobId, orderId: job.order_id, printerId: job.printer_id, reason: "BASILAMADI", error },
      },
      tx,
    );
    const already = await tx.notification.findFirst({
      where: { type: "print.failed", refType: "PrintJob", refId: jobId },
      select: { id: true },
    });
    if (already) return;
    const order = job.order_id
      ? await tx.order.findUnique({ where: { id: job.order_id }, select: { outletId: true, orderNo: true } })
      : null;
    const recipients = order ? await cashiers(tx, order.outletId) : [];
    await notify(
      {
        recipients: recipients.length > 0 ? recipients : { hotelId: job.hotel_id, roleCodes: ["R-KAS"] },
        type: "print.failed",
        title: "Fiş basılamadı",
        body: order ? `#${order.orderNo} · ${error}` : error,
        refType: "PrintJob",
        refId: jobId,
      },
      tx,
    );
  });
}

/**
 * Jobs stuck in BASILIYOR (gateway crashed mid-print) go back to KUYRUKTA after 60 s so the next
 * claim retries them; the return value feeds the `print.sweep` schedule.
 */
async function sweepStale(now: Date): Promise<number> {
  const { count } = await prisma.printJob.updateMany({
    where: { status: "BASILIYOR", startedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
    data: { status: "KUYRUKTA" },
  });
  return count;
}

/** One row of the queue pages (`/kasa/yazici`): the job plus its order and printer names. */
export type QueueJob = Prisma.PrintJobGetPayload<{
  include: {
    order: { select: { orderNo: true; table: { select: { label: true } } } };
    printer: { select: { name: true } };
  };
}>;

/** The calendar day after a 'yyyy-MM-dd' day (Date.UTC rolls month and year over). */
function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Queue rows of one hotel for the print window (`QS-FIS V`), newest first. `status` filters by
 * state; `day` ('yyyy-MM-dd', Nicosia business day) limits the rows to jobs created that day.
 */
async function listQueue(
  ctx: Ctx,
  hotelId: string,
  opts: { status?: PrintJobStatus; day?: string } = {},
): Promise<QueueJob[]> {
  await assertCan(ctx, "QS-FIS", "V", hotelId);
  if (ctx.user.roleKind === "OUTLET" && !ctx.session.outletId) {
    throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  }
  return prisma.printJob.findMany({
    where: {
      hotelId,
      ...(ctx.session.outletId
        ? {
            OR: [
              { order: { outletId: ctx.session.outletId } },
              { kind: "TEST", printer: { outletId: ctx.session.outletId } },
              { kind: "TEST", printer: { outletId: null } },
            ],
          }
        : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.day
        ? { createdAt: { gte: businessDateStart(opts.day), lt: businessDateStart(nextDay(opts.day)) } }
        : {}),
    },
    include: {
      order: { select: { orderNo: true, table: { select: { label: true } } } },
      printer: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
}

export const printJobs = { enqueueReceipt, enqueueTest, reprint, claim, report, sweepStale, listQueue };
