import { z } from "zod";
import { Prisma, type OrderStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { publish } from "@/lib/realtime";
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
  areas?: { id: string; label: string }[];
  tableOccupancyMinutes?: number | null;
  tables: {
    id: string;
    label: string;
    areaId?: string;
    areaLabel?: string;
    isActive: boolean;
    isOccupied?: boolean;
    emptiedAt?: Date;
    waiter?: { id: string; fullName: string };
    openOrders: {
      id: string;
      orderNo: number;
      status: OrderStatus;
      ageSec: number;
      totalPrice?: number;
      itemsCount?: number;
    }[];
    openCalls: number;
    callDetail?: { type: string; ageSec: number; note: string | null };
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

async function outletScope(ctx: Ctx, outletId: string, screen: "QS-KAS" | "QS-IPT"): Promise<{ hotelId: string; printerId: string | null; tableOccupancyMinutes: number | null }> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { hotelId: true, printerId: true, tableOccupancyMinutes: true },
  });
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
  const occMinutes = outlet.tableOccupancyMinutes;
  const scanCutoff = occMinutes !== null && occMinutes > 0 ? new Date(now.getTime() - occMinutes * 60_000) : null;
  const [tables, allOrders, calls, scans, printer, areaDefs] = await Promise.all([
    prisma.outletTable.findMany({
      where: { outletId },
      select: {
        id: true,
        label: true,
        isActive: true,
        emptiedAt: true,
        areaId: true,
        area: { select: { id: true, name: true, type: true } },
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
      // Open (non-terminal) orders stay on the board whatever their business date; KPIs below count today only.
      where: { outletId, OR: [{ businessDate: today }, { status: { in: [...OPEN_STATUSES] } }] },
      select: {
        id: true,
        businessDate: true,
        pricesShown: true,
        tableId: true,
        orderNo: true,
        status: true,
        createdAt: true,
        approvedAt: true,
        prepStartedAt: true,
        readyAt: true,
        items: { select: { qty: true, unitPrice: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.waiterCall.findMany({
      where: { outletId, status: "ACIK" },
      select: { tableId: true, type: true, createdAt: true, note: true },
      orderBy: { createdAt: "desc" },
    }),
    scanCutoff
      ? prisma.qrScanLog.findMany({
          where: { table: { outletId }, ok: true, createdAt: { gte: scanCutoff } },
          select: { tableId: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : Promise.resolve([]),
    prisma.printer.findFirst({
      where: { hotelId: outlet.hotelId, isActive: true, OR: [{ id: outlet.printerId ?? "" }, { outletId: null }] },
      select: { lastSeenAt: true, lastStatus: true },
      orderBy: [{ outletId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.outletAreaDefinition.findMany({
      where: { outletId },
      select: { id: true, name: true, type: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const dayOrders = allOrders.filter((order) => order.businessDate.getTime() === today.getTime());
  const callsByTable = new Map<string, number>();
  const callDetailByTable = new Map<string, { type: string; ageSec: number; note: string | null }>();
  for (const call of calls) {
    callsByTable.set(call.tableId, (callsByTable.get(call.tableId) ?? 0) + 1);
    if (!callDetailByTable.has(call.tableId)) {
      callDetailByTable.set(call.tableId, {
        type: call.type,
        ageSec: seconds(call.createdAt, now),
        note: call.note,
      });
    }
  }

  const scanByTable = new Map<string, Date>();
  for (const scan of scans) if (scan.tableId && !scanByTable.has(scan.tableId)) scanByTable.set(scan.tableId, scan.createdAt);
  const ordersByTable = new Map<string, TableBoard["tables"][number]["openOrders"]>();
  for (const order of allOrders) {
    if (!order.tableId || !OPEN_STATUSES.some((status) => status === order.status)) continue;
    const rows = ordersByTable.get(order.tableId) ?? [];
    // Amounts only where the order was taken with prices shown (snapshots exist regardless).
    const totalPrice = order.items
      .reduce((sum, item) => (order.pricesShown && item.unitPrice ? sum.plus(item.unitPrice.mul(item.qty)) : sum), new Prisma.Decimal(0))
      .toDecimalPlaces(2)
      .toNumber();
    const itemsCount = order.items.reduce((sum, item) => sum + item.qty, 0);
    rows.push({
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      ageSec: seconds(order.createdAt, now),
      totalPrice: totalPrice > 0 ? totalPrice : undefined,
      itemsCount: itemsCount > 0 ? itemsCount : undefined,
    });
    ordersByTable.set(order.tableId, rows);
  }
  const approvalTimes = dayOrders.flatMap((order) => order.approvedAt ? [seconds(order.createdAt, order.approvedAt)] : []);
  const prepTimes = dayOrders.flatMap((order) => {
    const from = order.prepStartedAt ?? order.approvedAt;
    return from && order.readyAt ? [seconds(from, order.readyAt)] : [];
  });

  const printerOnline = printer
    ? printer.lastStatus === "OK" && printer.lastSeenAt !== null && now.getTime() - printer.lastSeenAt.getTime() <= printerOnlineAfterMs
    : null;

  const areas = areaDefs.map((a) => ({
    id: a.id,
    label: a.name?.trim() || (a.type === "ACIK" ? "Açık alan" : "Kapalı alan"),
  }));

  return {
    areas,
    tableOccupancyMinutes: outlet.tableOccupancyMinutes,
    tables: tables.map((table) => {
      const scanDate = scanByTable.get(table.id);
      const validScan =
        scanDate && (!table.emptiedAt || scanDate.getTime() > table.emptiedAt.getTime())
          ? scanDate
          : undefined;
      const openOrders = ordersByTable.get(table.id) ?? [];
      const openCalls = callsByTable.get(table.id) ?? 0;
      const isOccupied = openOrders.length > 0 || openCalls > 0 || validScan !== undefined;

      return {
        id: table.id,
        label: table.label,
        areaId: table.areaId,
        areaLabel: table.area?.name?.trim() || (table.area?.type === "ACIK" ? "Açık alan" : "Kapalı alan"),
        isActive: table.isActive,
        isOccupied,
        ...(table.emptiedAt ? { emptiedAt: table.emptiedAt } : {}),
        ...(table.assignments[0] ? { waiter: table.assignments[0].user } : {}),
        openOrders,
        openCalls,
        ...(callDetailByTable.has(table.id) ? { callDetail: callDetailByTable.get(table.id)! } : {}),
        ...(validScan ? { lastScanAt: validScan } : {}),
      };
    }),
    kpis: {
      todayOrders: dayOrders.length,
      pending: dayOrders.filter((order) => order.status === "GONDERILDI").length,
      ...(average(approvalTimes) === undefined ? {} : { avgApprovalSec: average(approvalTimes) }),
      ...(average(prepTimes) === undefined ? {} : { avgPrepSec: average(prepTimes) }),
      openCalls: calls.length,
      printerOnline,
    },
  };
}

/** Manually sets a table to empty (BOŞ), clears active calls and records emptiedAt. */
async function clearTable(ctx: Ctx, tableId: string): Promise<void> {
  const table = await prisma.outletTable.findUnique({
    where: { id: tableId },
    include: { outlet: { select: { hotelId: true } } },
  });
  if (!table || !ctx.hotelIds.includes(table.outlet.hotelId)) throw new DomainError("NOT_FOUND", "Masa bulunamadı");
  if (!outletAllowed(ctx, table.outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  const hotelId = table.outlet.hotelId;
  const grants = await Promise.all([
    can(ctx, "QS-KAS", "D", hotelId),
    can(ctx, "QS-KUY", "D", hotelId),
    can(ctx, "QM-CAG", "D", hotelId),
  ]);
  if (!grants.some(Boolean)) throw new DomainError("FORBIDDEN", "Bu masayı boşaltma yetkiniz yok");

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.outletTable.update({
      where: { id: tableId },
      data: { emptiedAt: now },
    });
    await tx.waiterCall.updateMany({
      where: { tableId, status: "ACIK" },
      data: { status: "KAPANDI", resolvedById: ctx.user.id, resolvedAt: now },
    });
    await publish(
      {
        type: "table.cleared",
        hotelId: table.outlet.hotelId,
        outletId: table.outletId,
        payload: { tableId, tableLabel: table.label, emptiedAt: now.toISOString(), byUserId: ctx.user.id },
      },
      tx,
    );
  });
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

export const cashier = { tableBoard, recentOrders, clearTable };
