import { prisma } from "@/lib/prisma";
import { StockMovementType, TaskStatus } from "@/generated/prisma/client";
import { DomainError } from "@/lib/result";
import { getSettings } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { dayRange } from "./dates";
import { lockStocks } from "./poolStock";

export interface DepoStockItem {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  price: number;
  currency: string;
  quantity: number;
  minLevel: number;
  lastUpdated: string;
}

export interface StockMovementItem {
  id: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  note: string | null;
  userName: string;
  createdAt: string;
}

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
 * 1. Otel Konsinye Stok Havuzunu Getir
 */
export async function getHotelConsignmentStock(hotelId: string): Promise<DepoStockItem[]> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      group: true,
      stocks: {
        where: { hotelId },
      },
    },
    orderBy: [{ group: { name: "asc" } }, { name: "asc" }],
  });

  return products.map((p) => {
    const stock = p.stocks[0];
    return {
      id: stock?.id || `new-${p.id}`,
      productId: p.id,
      productName: p.name,
      categoryName: p.group.name,
      price: Number(p.salePrice || 0),
      currency: "TL",
      quantity: stock?.remainingQty ?? 0,
      minLevel: stock?.criticalLevel ?? 10,
      lastUpdated: stock?.updatedAt?.toISOString() || new Date().toISOString(),
    };
  });
}

/**
 * 2. Konsinye Havuzuna Ürün Girişi / Stok Ayarlama (Depo Sorumlusu)
 *
 * One transaction; the HotelStock row is locked (FOR UPDATE) before the balance is read, so
 * concurrent adjustments and room-check deductions can never push it below zero.
 */
export async function adjustHotelConsignmentStock(params: {
  hotelId: string;
  productId: string;
  changeQuantity: number;
  movementType: StockMovementType;
  note?: string;
  userId: string;
}): Promise<{ success: boolean; newQuantity: number; message: string }> {
  const { hotelId, productId, changeQuantity, movementType, note, userId } = params;

  if (!Number.isInteger(changeQuantity) || changeQuantity === 0) {
    throw new DomainError("VALIDATION", "Miktar sıfırdan farklı bir tam sayı olmalı.");
  }
  if (movementType === "GIRIS" && changeQuantity < 0) {
    throw new DomainError("VALIDATION", "Zimmet girişi pozitif olmalı.");
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new DomainError("NOT_FOUND", "Ürün bulunamadı.");
    await tx.hotelStock.upsert({
      where: { hotelId_productId: { hotelId, productId } },
      create: { hotelId, productId, criticalLevel: 10 },
      update: {},
    });
    await lockStocks(tx, hotelId, [productId]);
    const stock = await tx.hotelStock.findUniqueOrThrow({
      where: { hotelId_productId: { hotelId, productId } },
    });

    const prevRem = stock.remainingQty;
    const prevTotal = stock.totalQty;
    const newRem = prevRem + changeQuantity;

    if (newRem < 0) {
      throw new DomainError(
        "STOCK_INSUFFICIENT",
        `Yetersiz stok! Mevcut: ${prevRem}, düşülmek istenen: ${Math.abs(changeQuantity)}`,
      );
    }

    const updatedStock = await tx.hotelStock.update({
      where: { id: stock.id },
      data: {
        totalQty: prevTotal + (changeQuantity > 0 ? changeQuantity : 0),
        remainingQty: newRem,
      },
    });

    await tx.hotelStockMovement.create({
      data: {
        hotelId,
        productId,
        userId,
        type: movementType,
        qty: changeQuantity,
        refType: "HotelStock",
        refId: updatedStock.id,
        note: note || (changeQuantity > 0 ? "Depo sorumlusu zimmet girişi" : "Stok sayım düzeltmesi"),
      },
    });

    await audit(tx, {
      userId,
      hotelId,
      action: "STOCK_ADJUSTMENT",
      entity: "HotelStock",
      entityId: updatedStock.id,
      before: { remainingQty: prevRem, totalQty: prevTotal },
      after: {
        remainingQty: updatedStock.remainingQty,
        totalQty: updatedStock.totalQty,
        movementType,
        changeQuantity,
        note,
      },
    });

    return { success: true, newQuantity: updatedStock.remainingQty, message: "Stok başarıyla güncellendi." };
  });
}

/**
 * 3. Otel Stok Hareket Geçmişi
 */
export async function getHotelStockMovements(hotelId: string, limit = 50): Promise<StockMovementItem[]> {
  const movements = await prisma.hotelStockMovement.findMany({
    where: { hotelId },
    include: {
      product: true,
      user: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return movements.map((m) => ({
    id: m.id,
    productName: m.product.name,
    type: m.type,
    quantity: m.qty,
    note: m.note,
    userName: m.user?.fullName || "Sistem",
    createdAt: m.createdAt.toISOString(),
  }));
}

/**
 * 4. Minibar Tüketim Raporu
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
 * 5. Günlük Görev Tamamlanma Raporu
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
