// Replay source "rooms" (MINIBAR layer): finished room checks, changed/deleted checks from the audit log (only the
// room id is read out of the JSON, never the note), DND rounds, missed DND, task status changes and generated tasks.
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { ROOM_CHECK_CHANGE_ACTIONS } from "../../../constants";
import type { RadarEvent } from "../../../types";
import { mergeSources } from "../merge";
import { hasLayer, iso, pagedEvents, timeFilter, type ReplaySource, type ReplaySourceArgs, type TimeRange } from "./paging";

async function* roomChecks(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.roomCheck.findMany({
        where: { room: { hotelId: q.hotelId }, endedAt: timeFilter(range) },
        select: { id: true, roomId: true, userId: true, type: true, endedAt: true },
        orderBy: [{ endedAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.flatMap((r) => (r.endedAt ? [{ ...r, at: r.endedAt }] : []));
    },
    (c) => [
      {
        id: `room_checks:${c.id}:checked`,
        at: iso(c.at),
        hotelId: q.hotelId,
        layer: "MINIBAR",
        roomId: c.roomId,
        byUserId: c.userId,
        type: "room.checked",
        checkType: c.type,
      },
    ],
  );
}

type AuditRow = { id: string; at: Date; user_id: string | null; action: string; room_id: string | null };

function auditSql(q: ReplaySourceArgs, range: TimeRange, take: number | undefined): Prisma.Sql {
  const lower = range.gt ? Prisma.sql`a.created_at > ${range.gt}` : Prisma.sql`a.created_at >= ${range.gte!}`;
  return Prisma.sql`
    SELECT a.id, a.created_at AS at, a.user_id, a.action, a.before ->> 'roomId' AS room_id
    FROM audit_logs a
    WHERE a.hotel_id = ${q.hotelId} AND a.action IN (${Prisma.join([...ROOM_CHECK_CHANGE_ACTIONS])})
      AND ${lower} AND a.created_at <= ${range.lte}
    ORDER BY a.created_at ASC, a.id ASC
    ${take ? Prisma.sql`LIMIT ${take}` : Prisma.empty}`;
}

async function* checkChanges(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    (range, take) => prisma.$queryRaw<AuditRow[]>(auditSql(q, range, take)),
    (a) =>
      a.room_id
        ? [
            {
              id: `audit_logs:${a.id}:room-check`,
              at: iso(a.at),
              hotelId: q.hotelId,
              layer: "MINIBAR",
              roomId: a.room_id,
              ...(a.user_id ? { byUserId: a.user_id } : {}),
              type: "room.check.changed",
              op: a.action === "MINIBAR_ROOM_CHECK_DELETE" ? "SIL" : "DUZELT",
            },
          ]
        : [],
  );
}

async function* dndRounds(q: ReplaySourceArgs, minChecks: number): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    (range, take) =>
      prisma.roomDndCheck.findMany({
        where: { at: timeFilter(range), dnd: { hotelId: q.hotelId } },
        select: { id: true, at: true, no: true, userId: true, dnd: { select: { roomId: true } } },
        orderBy: [{ at: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      }),
    (k) => [
      {
        id: `room_dnd_checks:${k.id}:marked`,
        at: iso(k.at),
        hotelId: q.hotelId,
        layer: "MINIBAR",
        roomId: k.dnd.roomId,
        byUserId: k.userId,
        type: "dnd.marked",
        count: k.no,
        minChecks,
        status: k.no >= minChecks ? "TAMAMLANDI" : "AKTIF",
      },
    ],
  );
}

async function* dndMissed(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    (range, take) =>
      prisma.roomDnd
        .findMany({
          where: { hotelId: q.hotelId, status: "EKSIK", updatedAt: timeFilter(range) },
          select: { id: true, roomId: true, updatedAt: true },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          ...(take ? { take } : {}),
        })
        .then((rows) => rows.map((r) => ({ ...r, at: r.updatedAt }))),
    (d) => [
      {
        id: `room_dnds:${d.id}:missed`,
        at: iso(d.at),
        hotelId: q.hotelId,
        layer: "MINIBAR",
        roomId: d.roomId,
        type: "dnd.missed",
        roomIds: [d.roomId],
      },
    ],
  );
}

async function* taskLogs(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.taskStatusLog.findMany({
        where: { createdAt: timeFilter(range), taskItem: { task: { hotelId: q.hotelId } } },
        select: { id: true, createdAt: true, to: true, userId: true, taskItem: { select: { id: true, roomId: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.map((r) => ({ ...r, at: r.createdAt }));
    },
    (l) => [
      {
        id: `task_status_logs:${l.id}:updated`,
        at: iso(l.at),
        hotelId: q.hotelId,
        layer: "MINIBAR",
        roomId: l.taskItem.roomId,
        ...(l.userId ? { byUserId: l.userId } : {}),
        type: "task.updated",
        taskItemId: l.taskItem.id,
        to: l.to,
      },
    ],
  );
}

/** Fallback for completed items that never got a status log row: `DailyTaskItem.checkedAt`. */
async function* taskChecked(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.dailyTaskItem.findMany({
        where: { checkedAt: timeFilter(range), task: { hotelId: q.hotelId }, statusLogs: { none: {} } },
        select: { id: true, roomId: true, checkedAt: true },
        orderBy: [{ checkedAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.flatMap((r) => (r.checkedAt ? [{ ...r, at: r.checkedAt }] : []));
    },
    (i) => [
      {
        id: `daily_task_items:${i.id}:checked`,
        at: iso(i.at),
        hotelId: q.hotelId,
        layer: "MINIBAR",
        roomId: i.roomId,
        type: "task.updated",
        taskItemId: i.id,
        to: "TAMAMLANDI",
      },
    ],
  );
}

async function* tasksGenerated(q: ReplaySourceArgs): AsyncGenerator<RadarEvent> {
  yield* pagedEvents(
    q,
    async (range, take) => {
      const rows = await prisma.dailyTask.findMany({
        where: { hotelId: q.hotelId, createdAt: timeFilter(range) },
        select: { id: true, date: true, createdAt: true, _count: { select: { items: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        ...(take ? { take } : {}),
      });
      return rows.map((r) => ({ ...r, at: r.createdAt }));
    },
    (t) => [
      {
        id: `daily_tasks:${t.id}:generated`,
        at: iso(t.at),
        hotelId: q.hotelId,
        layer: "MINIBAR",
        type: "task.generated",
        date: t.date.toISOString().slice(0, 10),
        itemCount: t._count.items,
      },
    ],
  );
}

export const roomsSource: ReplaySource = (q) => {
  if (!hasLayer(q, "MINIBAR")) return mergeSources([]);
  return (async function* () {
    const minChecks = await getSetting("dnd.minChecks", q.hotelId);
    yield* mergeSources([
      roomChecks(q),
      checkChanges(q),
      dndRounds(q, minChecks),
      dndMissed(q),
      taskLogs(q),
      taskChecked(q),
      tasksGenerated(q),
    ]);
  })();
};
