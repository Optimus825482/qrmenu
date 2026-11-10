import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { usersEntitledTo } from "@/modules/core/server/entitlements";
import { onlineAt } from "@/modules/order/server/approvals";
import { publishRadar } from "@/modules/radar/publish";

/** Open room-service order states the SLA clock still runs in. */
export const SLA_OPEN_STATUSES: OrderStatus[] = ["TEYIT_BEKLIYOR", "ONAYLANDI", "HAZIR", "YOLDA"];

/**
 * Statuses the SLA sweep times: the clock runs from submission/confirmation. TEYIT_BEKLIYOR is
 * excluded (clock not running); GONDERILDI is included. `SLA_OPEN_STATUSES` (radar layer) is a
 * separate, wider "still open" set and stays unchanged.
 */
export const SLA_SWEEP_STATUSES: OrderStatus[] = ["GONDERILDI", "ONAYLANDI", "HAZIR", "YOLDA"];

import { SLA_WARN_RATIO, slaDue, slaStart, slaStateOf, type SlaState } from "./slaConstants";

export { SLA_WARN_RATIO, slaDue, slaStart, slaStateOf, type SlaState };

type Level = "WARN" | "BREACH";

type Subject = { hotelId: string; outletId: string };

/** Active members of the order's outlet among R-MUS holders (R-MUS entitlement alone is hotel-wide). */
async function outletManagers(tx: Prisma.TransactionClient, order: Subject): Promise<string[]> {
  const mus = await usersEntitledTo(order.hotelId, ["R-MUS"], tx);
  if (mus.length === 0) return [];
  const members = await tx.outletMember.findMany({
    where: { outletId: order.outletId, isActive: true, userId: { in: mus } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

/** WARN: the outlet's online room-service staff + F&B managers. BREACH: F&B managers + outlet managers + online staff. */
async function slaRecipients(tx: Prisma.TransactionClient, order: Subject, level: Level): Promise<string[]> {
  const [fbm, online, managers] = await Promise.all([
    usersEntitledTo(order.hotelId, ["R-FBM"], tx),
    onlineAt(tx, order.outletId, ["R-ODS", "R-BUT", "R-MUS"]),
    level === "BREACH" ? outletManagers(tx, order) : Promise.resolve([] as string[]),
  ]);
  return [...new Set([...fbm, ...online, ...managers])];
}

/**
 * Room-service SLA sweep (every minute). For each hotel with the ROOM_SERVICE module on, orders in
 * `SLA_SWEEP_STATUSES` whose clock (`slaStart`) reached 80 % of `rs.slaMinutes` are WARNed and at
 * 100 % BREACHed. Inside one transaction the order is re-read, the threshold re-checked on the
 * current row, then claimed with a conditional `updateMany`, so overlapping runs notify each level
 * once; audit, notification and radar event commit or roll back together. An order that skipped the
 * WARN window gets only BREACH (and `slaWarnedAt` is stamped if still empty, never overwritten).
 */
export async function rsSlaSweep(now: Date): Promise<{ warned: number; breached: number }> {
  const modules = await prisma.hotelModule.findMany({
    where: { moduleKey: "ROOM_SERVICE", enabled: true },
    select: { hotelId: true },
  });
  let warned = 0;
  let breached = 0;
  const levelOf = (o: { phoneConfirmedAt: Date | null; createdAt: Date }, slaMinutes: number): Level | null => {
    const ageMs = now.getTime() - slaStart(o).getTime();
    const limit = slaMinutes * 60_000;
    return ageMs >= limit ? "BREACH" : ageMs >= limit * SLA_WARN_RATIO ? "WARN" : null;
  };
  for (const { hotelId } of modules) {
    const slaMinutes = await getSetting("rs.slaMinutes", hotelId);
    if (!(slaMinutes > 0)) continue;
    const candidates = await prisma.order.findMany({
      where: { hotelId, kind: "ODA_SERVISI", status: { in: SLA_SWEEP_STATUSES }, slaBreachedAt: null },
      select: { id: true, phoneConfirmedAt: true, createdAt: true, slaWarnedAt: true },
    });
    for (const candidate of candidates) {
      const first = levelOf(candidate, slaMinutes);
      if (!first || (first === "WARN" && candidate.slaWarnedAt)) continue;
      try {
        const claimed = await prisma.$transaction(async (tx) => {
          const order = await tx.order.findFirst({
            where: { id: candidate.id, kind: "ODA_SERVISI", status: { in: SLA_SWEEP_STATUSES }, slaBreachedAt: null },
            select: {
              id: true,
              outletId: true,
              orderNo: true,
              roomId: true,
              phoneConfirmedAt: true,
              createdAt: true,
              slaWarnedAt: true,
              room: { select: { number: true } },
            },
          });
          if (!order?.roomId) return null;
          const level = levelOf(order, slaMinutes);
          if (!level || (level === "WARN" && order.slaWarnedAt)) return null;
          const claim = await tx.order.updateMany({
            where: {
              id: order.id,
              slaBreachedAt: null,
              status: { in: SLA_SWEEP_STATUSES },
              ...(level === "WARN" ? { slaWarnedAt: null } : {}),
            },
            data: level === "BREACH" ? { slaBreachedAt: now } : { slaWarnedAt: now },
          });
          if (claim.count !== 1) return null;
          if (level === "BREACH") {
            // Stamp the warning only if nobody has; a concurrent WARN time is never overwritten.
            await tx.order.updateMany({ where: { id: order.id, slaWarnedAt: null }, data: { slaWarnedAt: now } });
          }
          const roomId = order.roomId;
          const roomNumber = order.room?.number ?? null;
          const ageMin = Math.floor((now.getTime() - slaStart(order).getTime()) / 60_000);
          await audit(tx, {
            hotelId,
            action: level === "BREACH" ? "RS_SLA_BREACH" : "RS_SLA_WARN",
            entity: "Order",
            entityId: order.id,
            after: { level, ageMin, slaMinutes },
          });
          const roomLabel = roomNumber ?? "-";
          const remaining = Math.max(1, Math.ceil((slaDue(order, slaMinutes).getTime() - now.getTime()) / 60_000));
          await notify(
            {
              recipients: await slaRecipients(tx, { hotelId, outletId: order.outletId }, level),
              type: level === "BREACH" ? "order.sla.breach" : "order.sla.warn",
              title:
                level === "BREACH" ? `Oda servisi SLA aşıldı · Oda ${roomLabel}` : `Oda servisi gecikiyor · Oda ${roomLabel}`,
              body: level === "BREACH" ? `#${order.orderNo} · ${ageMin} dk` : `#${order.orderNo} · ${remaining} dk kaldı`,
              refType: "Order",
              refId: order.id,
              fallbackHotelId: hotelId,
            },
            tx,
          );
          await publishRadar(
            "order.sla",
            { hotelId, outletId: order.outletId, roomId },
            {
              orderId: order.id,
              orderNo: order.orderNo,
              roomId,
              ...(roomNumber ? { roomNumber } : {}),
              level,
              ageMin,
            },
            tx,
          );
          return level;
        });
        if (claimed === "BREACH") breached += 1;
        else if (claimed === "WARN") warned += 1;
      } catch (error) {
        // One bad order must not starve the rest; the rolled-back claim is retried next minute.
        console.error("[rs.sla-sweep]", candidate.id, error);
      }
    }
  }
  return { warned, breached };
}
