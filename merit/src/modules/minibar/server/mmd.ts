import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { lockRow } from "./minibarCommon";

/*
 * MMD (misafir müsait değil): the attendant went to the room and could not go in. It is NOT a DND: it does not
 * count towards `dnd.minChecks`, never completes the room or its task items and leaves the room waiting for a
 * real check. It is only a dated record (who, when, why) for the reports. No QR proof is asked, because the
 * room's code is inside the room that could not be entered. Consumption the guest handed over at the door goes
 * to the manager as a manual entry request (manualEntryRequests.ts), which is what books it.
 */

const SCREEN = "MB-TUK";

const schema = z
  .object({
    roomId: z.string().min(1).max(64),
    reason: z.string().trim().min(2, "MMD sebebi yazılmalı").max(200),
    /** Idempotency key of the client's tap: a repeat returns the first record. */
    clientRequestId: z.uuid().optional(),
  })
  .strict();

export type MmdView = { mmdId: string; roomId: string; roomNumber: string; reason: string; at: string; countToday: number };
export type MmdRow = { id: string; at: string; reason: string; by: string };

export async function recordMmd(ctx: Ctx, input: unknown, now: Date = new Date()): Promise<MmdView> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { roomId, reason, clientRequestId } = parsed.data;

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, number: true, hotelId: true } });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  await assertCan(ctx, SCREEN, "O", room.hotelId);
  const date = businessDay(businessDate(now));

  return prisma.$transaction(async (tx) => {
    const view = async (row: { id: string; reason: string; at: Date }): Promise<MmdView> => ({
      mmdId: row.id,
      roomId,
      roomNumber: room.number,
      reason: row.reason,
      at: row.at.toISOString(),
      countToday: await tx.roomMmd.count({ where: { roomId, date } }),
    });
    if (clientRequestId) {
      const seen = await tx.roomMmd.findUnique({ where: { clientRequestId } });
      if (seen) {
        if (seen.roomId !== roomId || seen.userId !== ctx.user.id) {
          throw new DomainError("CONFLICT", "Bu istek kimliği başka bir işlemde kullanılmış");
        }
        return view(seen);
      }
    }
    // Serialised with the room check and DND writers, so a check landing now is seen here.
    await lockRow(tx, "rooms", roomId);
    // Same rule as markDnd: a room checked today (replacement, "Sarfiyat Yok" or a completed DND) was entered,
    // so "could not go in" no longer applies to it.
    const covered = await tx.roomCheck.count({
      where: { roomId, checkDate: date, type: { in: ["URUN_EKLENDI", "SARFIYAT_YOK"] } },
    });
    if (covered > 0) throw new DomainError("CONFLICT", "Bu oda bugün zaten kontrol edildi; MMD kaydı girilemez");
    const dnd = await tx.roomDnd.findUnique({ where: { roomId_date: { roomId, date } }, select: { status: true } });
    if (dnd?.status === "TAMAMLANDI") {
      throw new DomainError("CONFLICT", "Bu oda için DND kontrolü bugün tamamlandı; MMD kaydı girilemez");
    }
    const row = await tx.roomMmd.create({
      data: { hotelId: room.hotelId, roomId, userId: ctx.user.id, date, at: now, reason, clientRequestId: clientRequestId ?? null },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: room.hotelId,
      action: "MMD_MARK",
      entity: "RoomMmd",
      entityId: row.id,
      before: null,
      after: { roomId, reason },
    });
    return view(row);
  });
}

/** MMD records of the room on the business day of `now`, newest first. */
export async function roomMmdsToday(ctx: Ctx, roomId: string, now: Date = new Date()): Promise<{ rows: MmdRow[] }> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { hotelId: true } });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  await assertCan(ctx, SCREEN, "V", room.hotelId);
  const rows = await prisma.roomMmd.findMany({
    where: { roomId, date: businessDay(businessDate(now)) },
    orderBy: { at: "desc" },
    take: 50,
    select: { id: true, at: true, reason: true, user: { select: { fullName: true } } },
  });
  return { rows: rows.map((r) => ({ id: r.id, at: r.at.toISOString(), reason: r.reason, by: r.user.fullName })) };
}
