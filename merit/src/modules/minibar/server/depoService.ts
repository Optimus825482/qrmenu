import { prisma } from "@/lib/prisma";
import { StockMovementType, TaskStatus } from "@/generated/prisma/client";
import { getBusinessDate } from "./minibarService";
import { audit } from "@/modules/core/server/audit";

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

  if (changeQuantity === 0) {
    throw new Error("Miktar sıfır olamaz.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const stock = await tx.hotelStock.findUnique({
      where: {
        hotelId_productId: { hotelId, productId },
      },
    });

    const prevRem = stock?.remainingQty ?? 0;
    const prevTotal = stock?.totalQty ?? 0;
    const newRem = prevRem + changeQuantity;

    if (newRem < 0) {
      throw new Error(`Yetersiz stok! Mevcut: ${prevRem}, düşülmek istenen: ${Math.abs(changeQuantity)}`);
    }

    let updatedStock;
    if (stock) {
      updatedStock = await tx.hotelStock.update({
        where: { id: stock.id },
        data: {
          totalQty: prevTotal + (changeQuantity > 0 ? changeQuantity : 0),
          remainingQty: newRem,
        },
      });
    } else {
      updatedStock = await tx.hotelStock.create({
        data: {
          hotelId,
          productId,
          totalQty: Math.max(0, changeQuantity),
          remainingQty: newRem,
          usedQty: 0,
          criticalLevel: 10,
        },
      });
    }

    await tx.hotelStockMovement.create({
      data: {
        hotelId,
        productId,
        userId,
        type: movementType,
        qty: changeQuantity,
        note: note || (changeQuantity > 0 ? "Depo sorumlusu zimmet girişi" : "Stok sayım düzeltmesi"),
      },
    });

    await audit(tx, {
      userId,
      hotelId,
      action: "STOCK_ADJUSTMENT",
      entity: "HotelStock",
      entityId: updatedStock.id,
      before: stock ? { remainingQty: prevRem, totalQty: prevTotal } : null,
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

  return result;
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
    const dateFilter: Record<string, Date> = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    whereClause.createdAt = dateFilter;
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
    orderBy: { createdAt: "desc" },
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
      date: tx.createdAt.toISOString(),
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
  const dateObj = targetDate ? new Date(targetDate) : getBusinessDate();

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
  const dndClosedTasks = taskItems.filter((t) => t.dndCount >= 3).length;
  const pendingTasks = taskItems.filter((t) => t.status === "BEKLIYOR").length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

  return {
    date: dateObj.toISOString().slice(0, 10),
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
