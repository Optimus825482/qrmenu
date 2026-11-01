import { z } from "zod";
import type { OrderStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { outletAllowed } from "./approvals";

const OPEN_STATUSES = ["GONDERILDI", "ONAYLANDI", "HAZIR"] as const satisfies readonly OrderStatus[];
const CANCELLABLE_VIEW_STATUSES = ["ONAYLANDI", "HAZIR", "SERVIS_EDILDI"] as const satisfies readonly OrderStatus[];
const printerOnlineAfterMs = 90_000;

const recentOptionsSchema = z.object({
  statuses: z.array(z.enum(["GONDERILDI", "ONAYLANDI", "HAZIR", "SERVIS_EDILDI", "REDDEDILDI", "IPTAL"])).min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type TableBoard = {
  tables: {
    id: string;
    label: string;
    isActive: boolean;
    waiter?: { id: string; fullName: string };
    openOrders: { id: string; orderNo: number; status: OrderStatus; ageSec: number }[];
    openCalls: number;
    lastScanAt?: Date;
  }[];
  kpis: {
    todayOrders: number;
    pending: number;
    avgApprovalSec?: number;
    avgPrepSec?: number;
    openCalls: number;
    printerOnline: boolean | null;
  };
};

async function outletScope(ctx: Ctx, outletId: string, screen: "QS-KAS" | "QS-IPT"): Promise<{ hotelId: string; printerId: string | null }> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true, printerId: true } });
  if (!outlet || !ctx.hotelIds.includes(outlet.hotelId)) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  await assertCan(ctx, screen, "V", outlet.hotelId);
  return outlet;
}

const seconds = (from: Date, to: Date): number => Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
const average = (values: number[]): number | undefined =>
  values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : undefined;

/**
 * Cashier projection for one outlet. All rows are constrained to the current Nicosia business
 * day so the cards and KPIs move together at business-day rollover.
 */
async function tableBoard(ctx: Ctx, outletId: string): Promise<TableBoard> {
  const outlet = await outletScope(ctx, outletId, "QS-KAS");
  const today = businessDay(businessDate());
  const now = new Date();
  const [tables, todayOrders, calls, scans, printer] = await Promise.all([
    prisma.outletTable.findMany({
      where: { outletId },
      select: {
        id: true,
        label: true,
        isActive: true,
        assignments: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { user: { select: { id: true, fullName: true } } },
        },
      },
      orderBy: [{ label: "asc" }, { id: "asc" }],
    }),
    prisma.order.findMany({
      where: { outletId, businessDate: today },
      select: { id: true, tableId: true, orderNo: true, status: true, createdAt: true, approvedAt: true, prepStartedAt: true, readyAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.waiterCall.findMany({
      where: { outletId, status: "ACIK" },
      select: { tableId: true },
    }),
    prisma.qrScanLog.findMany({
      where: { table: { outletId }, ok: true },
      select: { tableId: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.printer.findFirst({
      where: { hotelId: outlet.hotelId, isActive: true, OR: [{ id: outlet.printerId ?? "" }, { outletId: null }] },
      select: { lastSeenAt: true, lastStatus: true },
      orderBy: [{ outletId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const callsByTable = new Map<string, number>();
  for (const call of calls) callsByTable.set(call.tableId, (callsByTable.get(call.tableId) ?? 0) + 1);
  const scanByTable = new Map<string, Date>();
  for (const scan of scans) if (scan.tableId && !scanByTable.has(scan.tableId)) scanByTable.set(scan.tableId, scan.createdAt);
  const ordersByTable = new Map<string, TableBoard["tables"][number]["openOrders"]>();
  for (const order of todayOrders) {
    if (!order.tableId || !OPEN_STATUSES.some((status) => status === order.status)) continue;
    const rows = ordersByTable.get(order.tableId) ?? [];
    rows.push({ id: order.id, orderNo: order.orderNo, status: order.status, ageSec: seconds(order.createdAt, now) });
    ordersByTable.set(order.tableId, rows);
  }
  const approvalTimes = todayOrders.flatMap((order) => order.approvedAt ? [seconds(order.createdAt, order.approvedAt)] : []);
  const prepTimes = todayOrders.flatMap((order) => {
    const from = order.prepStartedAt ?? order.approvedAt;
    return from && order.readyAt ? [seconds(from, order.readyAt)] : [];
  });

  const printerOnline = printer
    ? printer.lastStatus === "OK" && printer.lastSeenAt !== null && now.getTime() - printer.lastSeenAt.getTime() <= printerOnlineAfterMs
    : null;
  return {
    tables: tables.map((table) => ({
      id: table.id,
      label: table.label,
      isActive: table.isActive,
      ...(table.assignments[0] ? { waiter: table.assignments[0].user } : {}),
      openOrders: ordersByTable.get(table.id) ?? [],
      openCalls: callsByTable.get(table.id) ?? 0,
      ...(scanByTable.has(table.id) ? { lastScanAt: scanByTable.get(table.id)! } : {}),
    })),
    kpis: {
      todayOrders: todayOrders.length,
      pending: todayOrders.filter((order) => order.status === "GONDERILDI").length,
      ...(average(approvalTimes) === undefined ? {} : { avgApprovalSec: average(approvalTimes) }),
      ...(average(prepTimes) === undefined ? {} : { avgPrepSec: average(prepTimes) }),
      openCalls: calls.length,
      printerOnline,
    },
  };
}

/** Recent orders for the cancellation screen; served orders are deliberately view-only in its UI. */
async function recentOrders(
  ctx: Ctx,
  outletId: string,
  rawOptions: unknown = {},
): Promise<{ id: string; orderNo: number; status: OrderStatus; createdAt: Date; table: { label: string } | null }[]> {
  const parsed = recentOptionsSchema.safeParse(rawOptions);
  if (!parsed.success) throw fromZod(parsed.error);
  await outletScope(ctx, outletId, "QS-IPT");
  return prisma.order.findMany({
    where: {
      outletId,
      status: { in: parsed.data.statuses ?? [...CANCELLABLE_VIEW_STATUSES] },
    },
    select: { id: true, orderNo: true, status: true, createdAt: true, table: { select: { label: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: parsed.data.limit,
  });
}

export const cashier = { tableBoard, recentOrders };
