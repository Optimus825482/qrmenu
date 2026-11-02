import { prisma } from "@/lib/prisma";
import { businessDate } from "@/lib/time";
import { addDays, dayRange } from "./dates";

export interface RoomAbnormalConsumption {
  roomId: string;
  roomNumber: string;
  floorName: string;
  hotelId: string;
  hotelName: string;
  totalQuantity: number;
  replenishmentCount: number;
  threshold: number;
  details: {
    productName: string;
    quantity: number;
  }[];
}

export interface ProductAbnormalConsumption {
  productId: string;
  productName: string;
  categoryName: string;
  hotelId: string;
  hotelName: string;
  todayConsumed: number;
  averageDailyConsumed: number;
  spikeRatio: number;
}

export interface AbnormalConsumptionReport {
  date: string;
  roomAnomalies: RoomAbnormalConsumption[];
  productAnomalies: ProductAbnormalConsumption[];
}

/** Default room items consumed in a single day to trigger abnormal room flag */
const DEFAULT_ROOM_DAILY_THRESHOLD = 6;

/**
 * Detects room-based and product-based abnormal minibar consumption for a given business date.
 */
export async function getAbnormalConsumption(params?: {
  hotelId?: string;
  date?: string;
  roomThreshold?: number;
}): Promise<AbnormalConsumptionReport> {
  const targetDate = params?.date || businessDate();
  const roomThreshold = params?.roomThreshold || DEFAULT_ROOM_DAILY_THRESHOLD;

  const { gte: startOfDay, lt: endOfDay } = dayRange(targetDate); // Europe/Nicosia business day

  // 1. Fetch transactions for the target business date
  const transactions = await prisma.minibarTransaction.findMany({
    where: {
      ...(params?.hotelId ? { hotelId: params.hotelId } : {}),
      occurredAt: {
        gte: startOfDay,
        lt: endOfDay,
      },
    },
    include: {
      room: {
        include: {
          floor: true,
          hotel: true,
        },
      },
      items: {
        include: { product: { include: { group: true } } },
      },
    },
  });

  // Group by room
  const roomMap = new Map<
    string,
    {
      roomId: string;
      roomNumber: string;
      floorName: string;
      hotelId: string;
      hotelName: string;
      replenishments: number;
      products: Map<string, { name: string; qty: number }>;
    }
  >();

  // Group by product for daily totals
  const productTodayMap = new Map<
    string,
    {
      productId: string;
      name: string;
      category: string;
      hotelId: string;
      hotelName: string;
      qty: number;
    }
  >();

  for (const tx of transactions) {
    const r = tx.room;
    if (!roomMap.has(r.id)) {
      roomMap.set(r.id, {
        roomId: r.id,
        roomNumber: r.number,
        floorName: r.floor.name,
        hotelId: r.hotel.id,
        hotelName: r.hotel.name,
        replenishments: 0,
        products: new Map(),
      });
    }

    const roomData = roomMap.get(r.id)!;
    roomData.replenishments += 1;

    for (const item of tx.items) {
      if (item.consumed <= 0) continue;

      // Room tally
      const curr = roomData.products.get(item.productId) || { name: item.product.name, qty: 0 };
      curr.qty += item.consumed;
      roomData.products.set(item.productId, curr);

      // Product tally
      const prodKey = `${r.hotel.id}-${item.productId}`;
      if (!productTodayMap.has(prodKey)) {
        productTodayMap.set(prodKey, {
          productId: item.productId,
          name: item.product.name,
          category: item.product.group.name,
          hotelId: r.hotel.id,
          hotelName: r.hotel.name,
          qty: 0,
        });
      }
      productTodayMap.get(prodKey)!.qty += item.consumed;
    }
  }

  // 2. Identify Room Anomalies
  const roomAnomalies: RoomAbnormalConsumption[] = [];
  for (const [, data] of roomMap.entries()) {
    const totalQty = Array.from(data.products.values()).reduce((sum, p) => sum + p.qty, 0);

    // Trigger if total quantity >= roomThreshold OR multiple replenishments in a single day
    if (totalQty >= roomThreshold || data.replenishments > 1) {
      roomAnomalies.push({
        roomId: data.roomId,
        roomNumber: data.roomNumber,
        floorName: data.floorName,
        hotelId: data.hotelId,
        hotelName: data.hotelName,
        totalQuantity: totalQty,
        replenishmentCount: data.replenishments,
        threshold: roomThreshold,
        details: Array.from(data.products.values()).map((p) => ({
          productName: p.name,
          quantity: p.qty,
        })),
      });
    }
  }

  // 3. Identify Product Spike Anomalies (Historical Comparison)
  // Check average consumption in the past 14 days
  const past14DaysStart = dayRange(addDays(targetDate, -14)).gte;
  const pastTransactions = await prisma.minibarTransactionItem.findMany({
    where: {
      transaction: {
        ...(params?.hotelId ? { hotelId: params.hotelId } : {}),
        occurredAt: {
          gte: past14DaysStart,
          lt: startOfDay,
        },
      },
      consumed: { gt: 0 },
    },
    select: {
      productId: true,
      consumed: true,
      transaction: { select: { hotelId: true } },
    },
  });

  const productHistoricalTotals = new Map<string, number>();
  for (const item of pastTransactions) {
    const key = `${item.transaction.hotelId}-${item.productId}`;
    productHistoricalTotals.set(key, (productHistoricalTotals.get(key) || 0) + item.consumed);
  }

  const productAnomalies: ProductAbnormalConsumption[] = [];
  for (const [key, today] of productTodayMap.entries()) {
    const pastTotal = productHistoricalTotals.get(key) || 0;
    const avgDaily = pastTotal > 0 ? Math.round((pastTotal / 14) * 10) / 10 : 2;

    // If today is 2.5x higher than daily average and at least 8 items
    const ratio = avgDaily > 0 ? today.qty / avgDaily : today.qty;
    if (today.qty >= 8 && ratio >= 2.2) {
      productAnomalies.push({
        productId: today.productId,
        productName: today.name,
        categoryName: today.category,
        hotelId: today.hotelId,
        hotelName: today.hotelName,
        todayConsumed: today.qty,
        averageDailyConsumed: avgDaily,
        spikeRatio: Math.round(ratio * 10) / 10,
      });
    }
  }

  // Sort by highest quantity / severity
  roomAnomalies.sort((a, b) => b.totalQuantity - a.totalQuantity);
  productAnomalies.sort((a, b) => b.spikeRatio - a.spikeRatio);

  return {
    date: targetDate,
    roomAnomalies,
    productAnomalies,
  };
}
