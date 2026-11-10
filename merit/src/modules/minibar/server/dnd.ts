import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import type { DndStatus, Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { getSettings } from "@/lib/settings";
import { businessDate, businessDay, TZ } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { WIRE_ROLE_KINDS } from "@/modules/radar/constants";
import { publishRadar } from "@/modules/radar/publish";
import { DND_MIN_GAP_SECONDS } from "../constants";
import { DND_REMINDER } from "../events";
import { lockRow } from "./minibarCommon";
import { assertRoomVerified } from "./roomVerification";
import { completeOpenItemsForRoom, failDndItems, markItemsDnd } from "./tasks";

/*
 * Do-not-disturb checks. One RoomDnd per room and business day; every mark adds a RoomDndCheck, a
 * RoomCheck(DND) and moves the room's task items. `dnd.minChecks` marks complete the room, a reminder
 * goes out `dnd.recheckMinutes` after the last mark (once), and whatever is still AKTIF at 23:59 becomes
 * EKSIK. Both settings are read per hotel; the threshold has this single source.
 */

type Tx = Prisma.TransactionClient;

const SCREEN_MARK = "MB-TUK";
const SCREEN_LIST = "MB-DND";
const DEPOT_ROLES = ["R-DEP", "R-OTM"];

export type DndView = {
  dndId: string;
  roomId: string;
  roomNumber: string;
  count: number;
  required: number;
  status: DndStatus;
  lastAt: string;
  nextCheckAt: string;
  completed: boolean;
  message: string;
};

export type DndRow = {
  dndId: string;
  roomId: string;
  roomNumber: string;
  floorName: string;
  count: number;
  required: number;
  firstAt: string;
  lastAt: string;
  status: DndStatus;
  linkedTask: boolean;
};

const markSchema = z
  .object({
    roomId: z.string().min(1).max(64),
    note: z.string().trim().max(200).optional(),
    /** Idempotency key of the client's tap (kept until success): a repeat returns the first mark. */
    clientRequestId: z.uuid().optional(),
  })
  .strict();

const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

function wire(
  room: { id: string; number: string; floorId: string },
  dnd: { count: number; status: DndStatus },
  required: number,
  byUserId: string,
) {
  return {
    roomId: room.id,
    roomNumber: room.number,
    floorId: room.floorId,
    count: dnd.count,
    required,
    status: dnd.status,
    byUserId,
  };
}

/**
 * Marks the room do-not-disturb for the business day of `now`. `MB-TUK O` of the room's hotel.
 * Reaching `dnd.minChecks` completes the DND and the room's open task items; below it the items wait.
 */
export async function markDnd(ctx: Ctx, input: unknown, now: Date = new Date()): Promise<DndView> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { roomId, note, clientRequestId } = parsed.data;

  const known = await prisma.room.findUnique({ where: { id: roomId }, select: { hotelId: true } });
  if (!known) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  const hotelId = known.hotelId;
  await assertCan(ctx, SCREEN_MARK, "O", hotelId);

  const settings = await getSettings(["dnd.minChecks", "dnd.recheckMinutes"], hotelId);
  const required = settings["dnd.minChecks"];
  const recheck = settings["dnd.recheckMinutes"];
  const day = businessDate(now);
  const date = businessDay(day);

  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "rooms", roomId);
    const room = await tx.room.findFirst({
      where: { id: roomId, hotelId },
      select: { id: true, number: true, floorId: true },
    });
    if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");

    if (clientRequestId) {
      // No schema column for the key: the DND_MARK audit row of the first request carries it (room lock held).
      const seen = await tx.auditLog.findFirst({
        where: {
          action: "DND_MARK",
          entity: "RoomDnd",
          userId: ctx.user.id,
          createdAt: { gte: new Date(now.getTime() - 86_400_000) },
          after: { path: ["clientRequestId"], equals: clientRequestId },
        },
        select: { entityId: true },
      });
      if (seen?.entityId) {
        const first = await tx.roomDnd.findUnique({ where: { id: seen.entityId } });
        if (!first || first.roomId !== roomId) {
          throw new DomainError("CONFLICT", "Bu istek kimliği başka bir işlemde kullanılmış");
        }
        const done = first.status === "TAMAMLANDI";
        return {
          dndId: first.id,
          roomId,
          roomNumber: room.number,
          count: first.count,
          required,
          status: first.status,
          lastAt: first.lastAt.toISOString(),
          nextCheckAt: addMinutes(first.lastAt, recheck).toISOString(),
          completed: done,
          message: done
            ? `Oda ${room.number} — ${first.count}. DND kontrolü tamamlandı`
            : `Oda ${room.number} DND olarak işaretlendi (${first.count}/${required})`,
        };
      }
    }
    await assertRoomVerified({ userId: ctx.user.id, roomId, hotelId }, now, tx);

    const covered = await tx.roomCheck.count({
      where: { roomId, checkDate: date, type: { in: ["URUN_EKLENDI", "SARFIYAT_YOK"] } },
    });
    if (covered > 0) throw new DomainError("CONFLICT", "Bu oda bugün zaten kontrol edildi");

    await tx.$queryRaw`SELECT id FROM room_dnds WHERE room_id = ${roomId} AND date = ${date}::date FOR UPDATE`;
    const existing = await tx.roomDnd.findUnique({ where: { roomId_date: { roomId, date } } });
    if (existing?.status === "TAMAMLANDI") {
      throw new DomainError("CONFLICT", "Bu oda için DND kontrolü bugün tamamlandı");
    }
    if (existing && existing.status !== "AKTIF") {
      throw new DomainError("CONFLICT", "Bu oda için günlük DND süresi doldu");
    }
    if (existing) {
      const mine = await tx.roomDndCheck.findFirst({
        where: { dndId: existing.id, userId: ctx.user.id },
        orderBy: [{ at: "desc" }, { no: "desc" }],
        select: { at: true },
      });
      if (mine && now.getTime() - mine.at.getTime() < DND_MIN_GAP_SECONDS * 1000) {
        throw new DomainError("CONFLICT", "DND az önce işaretlendi, birkaç saniye bekleyin");
      }
      // `dnd.recheckMinutes` holds for every user: the next mark waits that long after the last one.
      const leftMs = existing.lastAt.getTime() + recheck * 60_000 - now.getTime();
      if (leftMs > 0) {
        throw new DomainError(
          "CONFLICT",
          `DND yeniden kontrolü için ${Math.ceil(leftMs / 60_000)} dk daha beklenmeli`,
        );
      }
    }

    const count = (existing?.count ?? 0) + 1;
    const completed = count >= required;
    const status: DndStatus = completed ? "TAMAMLANDI" : "AKTIF";

    let taskItemId = existing?.taskItemId ?? null;
    if (!taskItemId) {
      const item = await tx.dailyTaskItem.findFirst({
        where: { roomId, task: { hotelId, date } },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      taskItemId = item?.id ?? null;
    }

    const dnd = existing
      ? await tx.roomDnd.update({
          where: { id: existing.id },
          data: { count, status, lastAt: now, reminderSentAt: null, taskItemId },
        })
      : await tx.roomDnd.create({
          data: { hotelId, roomId, date, count, status, firstAt: now, lastAt: now, taskItemId },
        });

    await tx.roomDndCheck.create({
      data: { dndId: dnd.id, no: count, userId: ctx.user.id, at: now, note: note || null },
    });

    const open = await tx.roomCheck.findFirst({
      where: { roomId, userId: ctx.user.id, checkDate: date, type: "ACIK", endedAt: null },
      select: { id: true },
    });
    if (open) {
      await tx.roomCheck.update({ where: { id: open.id }, data: { type: "DND", endedAt: now } });
    } else {
      await tx.roomCheck.create({
        data: { roomId, userId: ctx.user.id, checkDate: date, type: "DND", startedAt: now, endedAt: now },
      });
    }

    if (completed) {
      await completeOpenItemsForRoom(tx, {
        hotelId,
        roomId,
        day,
        userId: ctx.user.id,
        reason: "DND_ESIK",
        note: `${count} kez DND kontrolü yapıldı`,
        dndCount: count,
        now,
      });
    } else {
      await markItemsDnd(tx, { hotelId, roomId, day, userId: ctx.user.id, count, now });
    }

    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "DND_MARK",
      entity: "RoomDnd",
      entityId: dnd.id,
      before: existing ? { count: existing.count, status: existing.status } : null,
      after: { roomId, count, status, ...(clientRequestId ? { clientRequestId } : {}) },
    });

    await notify(
      {
        recipients: { hotelId, roleCodes: DEPOT_ROLES },
        type: "dnd.marked",
        title: `DND — Oda ${room.number}`,
        body: `${ctx.user.fullName} işaretledi (${count}/${required})`,
        refType: "RoomDnd",
        refId: dnd.id,
      },
      tx,
    );

    await publishRadar(
      completed ? "dnd.completed" : "dnd.marked",
      { hotelId, roomId },
      wire(room, dnd, required, ctx.user.id),
      tx,
    );

    return {
      dndId: dnd.id,
      roomId,
      roomNumber: room.number,
      count,
      required,
      status,
      lastAt: now.toISOString(),
      nextCheckAt: addMinutes(now, recheck).toISOString(),
      completed,
      message: completed
        ? `Oda ${room.number} — ${count}. DND kontrolü tamamlandı`
        : `Oda ${room.number} DND olarak işaretlendi (${count}/${required})`,
    };
  });
}

/**
 * A product replacement or "Sarfiyat Yok" record makes an active DND moot: it becomes TAMAMLANDI with an
 * automatic check (`no = count + 1`). Returns false when the room has no active DND that day; the caller
 * closes the task items either way.
 */
export async function autoCompleteDnd(
  tx: Tx,
  p: { hotelId: string; roomId: string; day: string; userId: string; reason: "IKAME" | "SARFIYAT_YOK" },
  now: Date = new Date(),
): Promise<boolean> {
  const date = businessDay(p.day);
  await tx.$queryRaw`SELECT id FROM room_dnds WHERE room_id = ${p.roomId} AND date = ${date}::date FOR UPDATE`;
  const dnd = await tx.roomDnd.findUnique({ where: { roomId_date: { roomId: p.roomId, date } } });
  if (!dnd || dnd.hotelId !== p.hotelId || dnd.status !== "AKTIF") return false;

  const note =
    p.reason === "IKAME"
      ? "OTOMATİK TAMAMLANDI: ürün eklendi — oda artık DND değil"
      : "OTOMATİK TAMAMLANDI: sarfiyat yok kaydı girildi — oda kontrol edildi";
  await tx.roomDnd.update({ where: { id: dnd.id }, data: { status: "TAMAMLANDI" } });
  await tx.roomDndCheck.create({ data: { dndId: dnd.id, no: dnd.count + 1, userId: p.userId, at: now, note } });
  await audit(tx, {
    userId: p.userId,
    hotelId: p.hotelId,
    action: "DND_AUTO_COMPLETE",
    entity: "RoomDnd",
    entityId: dnd.id,
    before: { count: dnd.count, status: dnd.status },
    after: { status: "TAMAMLANDI", reason: p.reason },
  });

  const [room, required] = await Promise.all([
    tx.room.findUniqueOrThrow({ where: { id: p.roomId }, select: { id: true, number: true, floorId: true } }),
    getSettings(["dnd.minChecks"], p.hotelId).then((s) => s["dnd.minChecks"]),
  ]);
  await publishRadar(
    "dnd.completed",
    { hotelId: p.hotelId, roomId: p.roomId },
    wire(room, { count: dnd.count, status: "TAMAMLANDI" }, required, p.userId),
    tx,
  );
  return true;
}

const listSchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional(),
    onlyActive: z.boolean().optional(),
  })
  .strict();

/** DND records of the session hotel for a business day (default today), most recent mark first. */
export async function listDnd(ctx: Ctx, q: z.input<typeof listSchema> = {}): Promise<DndRow[]> {
  const parsed = listSchema.safeParse(q);
  if (!parsed.success) throw fromZod(parsed.error);
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN_LIST, "V", hotelId);
  const day = parsed.data.day ?? businessDate();
  const required = (await getSettings(["dnd.minChecks"], hotelId))["dnd.minChecks"];
  const rows = await prisma.roomDnd.findMany({
    where: { hotelId, date: businessDay(day), ...(parsed.data.onlyActive ? { status: "AKTIF" } : {}) },
    orderBy: [{ lastAt: "desc" }, { id: "asc" }],
    include: { room: { select: { number: true, floor: { select: { name: true } } } } },
  });
  return rows.map((r) => ({
    dndId: r.id,
    roomId: r.roomId,
    roomNumber: r.room.number,
    floorName: r.room.floor.name,
    count: r.count,
    required,
    firstAt: r.firstAt.toISOString(),
    lastAt: r.lastAt.toISOString(),
    status: r.status,
    linkedTask: r.taskItemId !== null,
  }));
}

/** The numbered checks of one DND record, oldest first. */
export async function dndHistory(
  ctx: Ctx,
  dndId: string,
): Promise<{ no: number; at: string; userName: string; note: string | null }[]> {
  const dnd = await prisma.roomDnd.findUnique({ where: { id: dndId }, select: { hotelId: true } });
  if (!dnd) throw new DomainError("NOT_FOUND", "DND kaydı bulunamadı");
  await assertCan(ctx, SCREEN_LIST, "V", dnd.hotelId);
  const checks = await prisma.roomDndCheck.findMany({
    where: { dndId },
    orderBy: [{ no: "asc" }, { at: "asc" }],
    include: { user: { select: { fullName: true } } },
  });
  return checks.map((c) => ({ no: c.no, at: c.at.toISOString(), userName: c.user.fullName, note: c.note }));
}

/**
 * Minute scan: an AKTIF DND of today below the threshold whose last mark is `dnd.recheckMinutes` old and
 * which was not reminded yet notifies the hotel's floor supervisors once. Returns the reminders sent.
 */
export async function runDndReminders(now: Date = new Date()): Promise<number> {
  const date = businessDay(businessDate(now));
  const candidates = await prisma.roomDnd.findMany({
    where: { date, status: "AKTIF", reminderSentAt: null },
    select: { id: true, hotelId: true },
    orderBy: { id: "asc" },
  });
  const settingsOf = new Map<string, Awaited<ReturnType<typeof getSettings<"dnd.minChecks" | "dnd.recheckMinutes">>>>();
  let sent = 0;
  for (const c of candidates) {
    let s = settingsOf.get(c.hotelId);
    if (!s) {
      s = await getSettings(["dnd.minChecks", "dnd.recheckMinutes"], c.hotelId);
      settingsOf.set(c.hotelId, s);
    }
    const required = s["dnd.minChecks"];
    const recheck = s["dnd.recheckMinutes"];
    const done = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM room_dnds WHERE id = ${c.id} FOR UPDATE`;
      const dnd = await tx.roomDnd.findUnique({
        where: { id: c.id },
        include: { room: { select: { id: true, number: true, floorId: true } } },
      });
      if (!dnd || dnd.status !== "AKTIF" || dnd.reminderSentAt !== null || dnd.count >= required) return false;
      if (addMinutes(dnd.lastAt, recheck).getTime() > now.getTime()) return false;
      await tx.roomDnd.update({ where: { id: dnd.id }, data: { reminderSentAt: now } });
      await notify(
        {
          recipients: { hotelId: dnd.hotelId, roleCodes: ["R-KAT"] },
          type: "dnd.reminder",
          title: `DND tekrar kontrol — Oda ${dnd.room.number}`,
          body: `${dnd.count}/${required} kontrol yapıldı; son kontrol ${formatInTimeZone(dnd.lastAt, TZ, "HH:mm")}`,
          refType: "RoomDnd",
          refId: dnd.id,
        },
        tx,
      );
      await publish(
        {
          type: DND_REMINDER,
          hotelId: dnd.hotelId,
          roomId: dnd.roomId,
          roleKinds: WIRE_ROLE_KINDS["dnd.marked"] ?? undefined,
          payload: {
            roomId: dnd.roomId,
            roomNumber: dnd.room.number,
            floorId: dnd.room.floorId,
            count: dnd.count,
            required,
            status: dnd.status,
          },
        },
        tx,
      );
      return true;
    });
    if (done) sent += 1;
  }
  return sent;
}

/**
 * Day end: every AKTIF DND dated `upToDay` or earlier becomes EKSIK, its waiting task items EKSIK, one
 * summary notification per hotel. Idempotent (the second call finds nothing). The 23:59 job passes today,
 * the 00:01 catch-up passes yesterday so a mark made in the last seconds of the day is still closed.
 */
export async function closeDndDay(upToDay: string, now: Date = new Date()): Promise<number> {
  const upTo = businessDay(upToDay);
  const open = await prisma.roomDnd.findMany({
    where: { date: { lte: upTo }, status: "AKTIF" },
    select: { hotelId: true },
    distinct: ["hotelId"],
    orderBy: { hotelId: "asc" },
  });
  let closed = 0;
  for (const { hotelId } of open) {
    closed += await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM room_dnds WHERE hotel_id = ${hotelId} AND status = 'AKTIF' AND date <= ${upTo}::date ORDER BY id FOR UPDATE`;
      const rows = await tx.roomDnd.findMany({
        where: { hotelId, date: { lte: upTo }, status: "AKTIF" },
        select: { id: true, roomId: true, date: true },
        orderBy: { id: "asc" },
      });
      if (rows.length === 0) return 0;
      await tx.roomDnd.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "EKSIK" } });

      const byDay = new Map<string, string[]>();
      for (const r of rows) {
        const d = r.date.toISOString().slice(0, 10);
        byDay.set(d, [...(byDay.get(d) ?? []), r.roomId]);
      }
      for (const [d, roomIds] of byDay) {
        await failDndItems(tx, { hotelId, day: d, roomIds });
        await publishRadar(
          "dnd.missed",
          { hotelId },
          { date: d, roomIds: roomIds.length > 300 ? [] : roomIds },
          tx,
        );
      }

      const hotel = await tx.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { name: true } });
      await notify(
        {
          recipients: { hotelId, roleCodes: DEPOT_ROLES },
          type: "dnd.dayend",
          title: `DND gün sonu — ${hotel.name}`,
          body: `${rows.length} oda için DND kontrolü tamamlanamadı`,
        },
        tx,
      );
      await audit(tx, {
        hotelId,
        action: "DND_DAY_END",
        entity: "RoomDnd",
        after: { upToDay, count: rows.length, closedAt: now.toISOString() },
      });
      return rows.length;
    });
  }
  return closed;
}

/** Loads the current day's DND info and recent DND checks history for a specific room. */
export async function getRoomDndDetails(ctx: Ctx, roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      number: true,
      hotelId: true,
      floor: { select: { id: true, name: true } },
      roomType: { select: { name: true } },
    },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  await assertCan(ctx, "MB-KAT", "V", room.hotelId);

  const today = businessDate(new Date());
  const date = businessDay(today);

  const [currentDnd, history, settings] = await Promise.all([
    prisma.roomDnd.findUnique({
      where: { roomId_date: { roomId, date } },
      include: {
        checks: {
          include: { user: { select: { fullName: true } } },
          orderBy: { at: "desc" },
        },
      },
    }),
    prisma.roomDnd.findMany({
      where: { roomId },
      include: {
        checks: {
          include: { user: { select: { fullName: true } } },
          orderBy: { at: "desc" },
        },
      },
      orderBy: { date: "desc" },
      take: 7,
    }),
    getSettings(["dnd.minChecks", "dnd.recheckMinutes", "minibar.requireQrForControl"], room.hotelId),
  ]);

  return {
    room: {
      id: room.id,
      number: room.number,
      floorName: room.floor.name,
      roomTypeName: room.roomType?.name ?? "Standart Oda",
    },
    currentDnd: currentDnd
      ? {
          id: currentDnd.id,
          count: currentDnd.count,
          status: currentDnd.status,
          firstAt: currentDnd.firstAt.toISOString(),
          lastAt: currentDnd.lastAt.toISOString(),
          checks: currentDnd.checks.map((c) => ({
            no: c.no,
            at: c.at.toISOString(),
            userName: c.user.fullName,
            note: c.note,
          })),
        }
      : null,
    history: history.map((h) => ({
      date: businessDate(h.date),
      count: h.count,
      status: h.status,
      lastAt: h.lastAt.toISOString(),
      checks: h.checks.map((c) => ({
        no: c.no,
        at: c.at.toISOString(),
        userName: c.user.fullName,
        note: c.note,
      })),
    })),
    settings: {
      minChecks: settings["dnd.minChecks"],
      recheckMinutes: settings["dnd.recheckMinutes"],
      requireQrForControl: settings["minibar.requireQrForControl"],
    },
  };
}
