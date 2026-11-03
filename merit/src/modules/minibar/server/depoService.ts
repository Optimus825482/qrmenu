import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@/generated/prisma/client";
import { getSettings } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { dayRange } from "./dates";

export interface ConsumptionReportFilter {
  hotelId: string;
  startDate?: string;
  endDate?: string;
  floorId?: string;
  roomId?: string;
}

export interface ConsumptionReportItem {
  transactionId: string;
  roomNumber: string;
  floorName: string;
  staffName: string;
  date: string;
  totalCost: number;
  currency: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

export interface TaskCompletionReport {
  date: string;
  totalTasks: number;
  completedTasks: number;
  dndClosedTasks: number;
  pendingTasks: number;
  completionRate: number;
  items: {
    roomNumber: string;
    floorName: string;
    taskType: string;
    status: TaskStatus;
    priority: number;
    dndCount: number;
    checkedAt: string | null;
    note: string | null;
  }[];
}

/**
 * 1. Minibar Tüketim Raporu
 */
export async function getMinibarConsumptionReport(filter: ConsumptionReportFilter): Promise<{
  totalAmount: number;
  totalQuantity: number;
  transactionsCount: number;
  reportItems: ConsumptionReportItem[];
}> {
  const { hotelId, startDate, endDate, floorId, roomId } = filter;

  const whereClause: Record<string, unknown> = {
    hotelId,
  };

  if (roomId) {
    whereClause.roomId = roomId;
  } else if (floorId) {
    whereClause.room = { floorId };
  }

  if (startDate || endDate) {
    // Europe/Nicosia business days: [start of first day, start of the day after the last day).
    const dateFilter: { gte?: Date; lt?: Date } = {};
    if (startDate) dateFilter.gte = dayRange(startDate).gte;
    if (endDate) dateFilter.lt = dayRange(endDate).lt;
    whereClause.occurredAt = dateFilter;
  }

  const transactions = await prisma.minibarTransaction.findMany({
    where: whereClause,
    include: {
      room: {
        include: { floor: true },
      },
      user: true,
      items: {
        include: { product: true },
      },
    },
    orderBy: { occurredAt: "desc" },
  });

  let totalAmount = 0;
  let totalQuantity = 0;

  const reportItems: ConsumptionReportItem[] = transactions.map((tx) => {
    let txCost = 0;

    const items = tx.items.map((i) => {
      const lineCost = Number(i.salePrice || 0) * i.consumed;
      txCost += lineCost;
      totalQuantity += i.consumed;

      return {
        productName: i.product.name,
        quantity: i.consumed,
        unitPrice: Number(i.salePrice || 0),
        lineTotal: lineCost,
      };
    });

    totalAmount += txCost;

    return {
      transactionId: tx.id,
      roomNumber: tx.room.number,
      floorName: tx.room.floor.name,
      staffName: tx.user?.fullName || "Personel",
      date: tx.occurredAt.toISOString(),
      totalCost: txCost,
      currency: "TL",
      items,
    };
  });

  return {
    totalAmount,
    totalQuantity,
    transactionsCount: transactions.length,
    reportItems,
  };
}

/**
 * 2. Günlük Görev Tamamlanma Raporu
 */
export async function getDailyTaskCompletionReport(
  hotelId: string,
  targetDate?: string
): Promise<TaskCompletionReport> {
  const day = targetDate ?? businessDate();
  const dateObj = businessDay(day); // VALIDATION on a malformed date
  const { "dnd.minChecks": minChecks } = await getSettings(["dnd.minChecks"], hotelId);

  const taskItems = await prisma.dailyTaskItem.findMany({
    where: {
      task: {
        hotelId,
        date: dateObj,
      },
    },
    include: {
      task: true,
      room: {
        include: { floor: true },
      },
    },
    orderBy: [{ priority: "asc" }, { room: { number: "asc" } }],
  });

  const totalTasks = taskItems.length;
  const completedTasks = taskItems.filter((t) => t.status === "TAMAMLANDI").length;
  const dndClosedTasks = taskItems.filter((t) => t.dndCount >= minChecks).length;
  const pendingTasks = taskItems.filter((t) => t.status === "BEKLIYOR").length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

  return {
    date: day,
    totalTasks,
    completedTasks,
    dndClosedTasks,
    pendingTasks,
    completionRate,
    items: taskItems.map((item) => ({
      roomNumber: item.room.number,
      floorName: item.room.floor.name,
      taskType: item.task.type,
      status: item.status,
      priority: item.priority,
      dndCount: item.dndCount,
      checkedAt: item.checkedAt?.toISOString() || null,
      note: item.note,
    })),
  };
}
