import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { businessDate } from "@/lib/time";
import { notify } from "@/modules/core/server/notifications";
import { EXPIRY_WARN_DAYS, STOCK_MANAGER_ROLES } from "./pool";

/** Notification type of the daily SKT warning (one per hotel and business day). */
export const EXPIRY_ALERT_TYPE = "stock.expiry";
const NAMED_PRODUCTS = 5;

export type ExpiryHotelSummary = {
  hotelId: string;
  hotelName: string;
  /** Lots whose SKT has passed and that still hold stock. */
  expired: number;
  /** Lots whose SKT falls within `EXPIRY_WARN_DAYS`. */
  near: number;
  /** The most urgent lots, earliest SKT first. */
  top: { productName: string; expiryDate: string; daysLeft: number; remainingQty: number }[];
};

const dayMs = 86_400_000;
const trDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Dated stock that is past or close to its SKT, per hotel; hotels with nothing to report are left out. */
export async function expirySummaries(hotelIds: string[], today: string = businessDate()): Promise<ExpiryHotelSummary[]> {
  if (hotelIds.length === 0) return [];
  const base = Date.parse(`${today}T00:00:00Z`);
  const limit = new Date(base + EXPIRY_WARN_DAYS * dayMs);
  const lots = await prisma.hotelStockLot.findMany({
    where: { hotelId: { in: hotelIds }, remainingQty: { gt: 0 }, expiryDate: { lte: limit }, hotel: { isActive: true } },
    select: {
      hotelId: true,
      expiryDate: true,
      remainingQty: true,
      product: { select: { name: true } },
      hotel: { select: { name: true } },
    },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
  });
  const byHotel = new Map<string, ExpiryHotelSummary>();
  for (const lot of lots) {
    const expiryDate = lot.expiryDate.toISOString().slice(0, 10);
    const daysLeft = Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - base) / dayMs);
    const row = byHotel.get(lot.hotelId) ?? { hotelId: lot.hotelId, hotelName: lot.hotel.name, expired: 0, near: 0, top: [] };
    if (daysLeft < 0) row.expired += 1;
    else row.near += 1;
    if (row.top.length < NAMED_PRODUCTS) {
      row.top.push({ productName: lot.product.name, expiryDate, daysLeft, remainingQty: lot.remainingQty });
    }
    byHotel.set(lot.hotelId, row);
  }
  return [...byHotel.values()].sort((a, b) => a.hotelName.localeCompare(b.hotelName, "tr"));
}

function alertText(s: ExpiryHotelSummary): { title: string; body: string } {
  const counts = [s.expired > 0 ? `${s.expired} partinin SKT'si geçti` : "", s.near > 0 ? `${s.near} partinin SKT'si yaklaşıyor` : ""]
    .filter(Boolean)
    .join(", ");
  const named = s.top
    .map((t) =>
      t.daysLeft < 0
        ? `${t.productName} (${t.remainingQty} adet, SKT ${trDate(t.expiryDate)} geçti)`
        : `${t.productName} (${t.remainingQty} adet, ${t.daysLeft} gün kaldı)`,
    )
    .join("; ");
  return {
    title: `${s.hotelName} - SKT uyarısı`,
    body: `${s.hotelName} otel deposunda ${counts}. ${named}. Ayrıntı: Otel Deposu › SKT takibi.`,
  };
}

/**
 * Writes the day's SKT warning for each hotel that has dated stock past or within `EXPIRY_WARN_DAYS` of its SKT,
 * to the minibar system manager and the system administrator. One warning per hotel and business day: a second
 * run on the same day (the 08:00 job, a restart, a sign-in) writes nothing. Returns the notifications written.
 */
export async function runExpiryAlerts(now: Date = new Date(), onlyHotelIds?: string[]): Promise<number> {
  const today = businessDate(now);
  const hotelIds =
    onlyHotelIds ?? (await prisma.hotel.findMany({ where: { isActive: true }, select: { id: true } })).map((h) => h.id);
  let written = 0;
  for (const summary of await expirySummaries(hotelIds, today)) {
    const refId = `${summary.hotelId}:${today}`;
    written += await prisma.$transaction(async (tx) => {
      // Serialised per hotel so two concurrent runs cannot both pass the "already sent" check.
      await tx.$queryRaw`SELECT id FROM hotels WHERE id = ${summary.hotelId} FOR UPDATE`;
      if (await tx.notification.findFirst({ where: { type: EXPIRY_ALERT_TYPE, refId }, select: { id: true } })) return 0;
      return notify(
        {
          recipients: { hotelId: summary.hotelId, roleCodes: [...STOCK_MANAGER_ROLES] },
          type: EXPIRY_ALERT_TYPE,
          refType: "HotelStockExpiry",
          refId,
          ...alertText(summary),
        },
        tx,
      );
    });
  }
  return written;
}

/**
 * What the minibar system manager is shown at sign-in: the SKT state of their hotels. Also makes sure today's
 * warning exists (the 08:00 job may not have run yet, or a delivery with a close SKT arrived after it).
 */
export async function expiryLoginSummary(ctx: Ctx, now: Date = new Date()): Promise<{ hotels: ExpiryHotelSummary[] }> {
  if (!STOCK_MANAGER_ROLES.includes(ctx.user.roleCode)) {
    throw new DomainError("FORBIDDEN", "SKT uyarılarını yalnızca minibar sistem sorumlusu görebilir");
  }
  const hotels = await expirySummaries(ctx.hotelIds, businessDate(now));
  if (hotels.length > 0) await runExpiryAlerts(now, hotels.map((h) => h.hotelId));
  return { hotels };
}
