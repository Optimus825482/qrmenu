import { z } from "zod";
import type { Prisma, TaskStatus, TaskType } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { publishRadar } from "@/modules/radar/publish";
import { dayRange } from "./dates";
import type { Db } from "./minibarCommon";

/*
 * Core of the daily task items (one row per room in each of the day's three tasks). Every status
 * change of an item goes through here: it is written together with a TaskStatusLog row, the parent
 * task status is recomputed and one `task.updated` event announces the change. All functions run
 * inside the caller's transaction; callers hold the room row lock, the item and task rows are locked
 * here (FOR UPDATE, id order) so concurrent writers cannot interleave.
 */

type Tx = Prisma.TransactionClient;

const OPEN: TaskStatus[] = ["BEKLIYOR", "DEVAM", "DND_BEKLIYOR"];
/** `task.updated` carries at most this many items (radar wire limit); the rest is flagged `truncated`. */
const WIRE_ITEM_LIMIT = 100;

export type CompleteReason = "IKAME" | "SARFIYAT_YOK" | "DND_ESIK";

const REASON_NOTE: Record<CompleteReason, string> = {
  IKAME: "Ürün ikamesi yapıldı",
  SARFIYAT_YOK: "Sarfiyat yok",
  DND_ESIK: "DND kontrolü tamamlandı",
};

type ItemRow = { id: string; taskId: string; roomId: string; status: TaskStatus; dndCount: number };
type Change = { taskItemId: string; roomId: string; from: TaskStatus; to: TaskStatus };

async function lockItems(tx: Tx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM daily_task_items WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
}

async function lockTask(tx: Tx, taskId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id = ${taskId} FOR UPDATE`;
}

/** Locks, then returns the matching items (status is re-checked after the lock). */
async function lockedItems(tx: Tx, where: Prisma.DailyTaskItemWhereInput): Promise<ItemRow[]> {
  const select = { id: true, taskId: true, roomId: true, status: true, dndCount: true } as const;
  const probe = await tx.dailyTaskItem.findMany({ where, select: { id: true } });
  if (probe.length === 0) return [];
  await lockItems(tx, probe.map((p) => p.id).sort());
  return tx.dailyTaskItem.findMany({ where, select, orderBy: { id: "asc" } });
}

function dayWhere(hotelId: string, day: string): Prisma.DailyTaskWhereInput {
  return { hotelId, date: businessDay(day) };
}

/** Writes the new status + one log row per item, recomputes the parent tasks, announces the change. */
async function moveItems(
  tx: Tx,
  hotelId: string,
  rows: ItemRow[],
  to: TaskStatus,
  opts: {
    userId?: string;
    note: string;
    data?: (row: ItemRow) => Prisma.DailyTaskItemUncheckedUpdateInput;
  },
): Promise<{ itemIds: string[]; taskIds: string[] }> {
  const changes: Change[] = [];
  for (const row of rows) {
    await tx.dailyTaskItem.update({
      where: { id: row.id },
      data: { ...(opts.data?.(row) ?? {}), status: to },
    });
    if (row.status !== to) {
      await tx.taskStatusLog.create({
        data: { taskItemId: row.id, from: row.status, to, userId: opts.userId ?? null, note: opts.note },
      });
      changes.push({ taskItemId: row.id, roomId: row.roomId, from: row.status, to });
    }
  }
  const taskIds = [...new Set(rows.map((r) => r.taskId))].sort();
  for (const taskId of taskIds) await recomputeTaskStatus(tx, taskId);
  await announce(tx, hotelId, changes, opts.userId);
  return { itemIds: rows.map((r) => r.id), taskIds };
}

async function announce(tx: Tx, hotelId: string, changes: Change[], userId?: string): Promise<void> {
  if (changes.length === 0) return;
  const truncated = changes.length > WIRE_ITEM_LIMIT;
  await publishRadar(
    "task.updated",
    { hotelId },
    {
      ...(truncated ? { truncated: true as const } : { items: changes }),
      ...(userId ? { byUserId: userId } : {}),
    },
    tx,
  );
}

/**
 * All open items (BEKLIYOR|DEVAM|DND_BEKLIYOR) of the room on that business day become TAMAMLANDI.
 * `dndCount` (optional) also stores the DND counters of the mark that completed them.
 * No open item = no-op (no log, no event).
 */
export async function completeOpenItemsForRoom(
  tx: Tx,
  p: {
    hotelId: string;
    roomId: string;
    day: string;
    userId: string;
    reason: CompleteReason;
    note?: string;
    dndCount?: number;
    now?: Date;
  },
): Promise<{ itemIds: string[]; taskIds: string[] }> {
  const now = p.now ?? new Date();
  const rows = await lockedItems(tx, {
    roomId: p.roomId,
    status: { in: OPEN },
    task: dayWhere(p.hotelId, p.day),
  });
  if (rows.length === 0) return { itemIds: [], taskIds: [] };
  return moveItems(tx, p.hotelId, rows, "TAMAMLANDI", {
    userId: p.userId,
    note: p.note ?? REASON_NOTE[p.reason],
    data: () => ({
      checkedAt: now,
      ...(p.dndCount !== undefined ? { dndCount: p.dndCount, lastDndAt: now } : {}),
    }),
  });
}

/** Open items of the room wait for the next DND check: DND_BEKLIYOR, `dndCount = count`, `lastDndAt = now`. */
export async function markItemsDnd(
  tx: Tx,
  p: { hotelId: string; roomId: string; day: string; userId: string; count: number; now?: Date },
): Promise<{ itemIds: string[] }> {
  const now = p.now ?? new Date();
  const rows = await lockedItems(tx, {
    roomId: p.roomId,
    status: { in: OPEN },
    task: dayWhere(p.hotelId, p.day),
  });
  if (rows.length === 0) return { itemIds: [] };
  const { itemIds } = await moveItems(tx, p.hotelId, rows, "DND_BEKLIYOR", {
    userId: p.userId,
    note: `DND işaretlendi (${p.count})`,
    data: () => ({ dndCount: p.count, lastDndAt: now }),
  });
  return { itemIds };
}

/** Day end: DND_BEKLIYOR items (of the given rooms, or all) become EKSIK; the log has no user. */
export async function failDndItems(
  tx: Tx,
  p: { hotelId: string; day: string; roomIds?: string[] },
): Promise<{ itemIds: string[] }> {
  if (p.roomIds && p.roomIds.length === 0) return { itemIds: [] };
  const rows = await lockedItems(tx, {
    status: "DND_BEKLIYOR",
    ...(p.roomIds ? { roomId: { in: p.roomIds } } : {}),
    task: dayWhere(p.hotelId, p.day),
  });
  if (rows.length === 0) return { itemIds: [] };
  const min = await getSetting("dnd.minChecks", p.hotelId);
  const changes: Change[] = [];
  for (const row of rows) {
    await tx.dailyTaskItem.update({ where: { id: row.id }, data: { status: "EKSIK" } });
    await tx.taskStatusLog.create({
      data: {
        taskItemId: row.id,
        from: row.status,
        to: "EKSIK",
        note: `Gün sonu — DND kontrolü tamamlanmadı (${row.dndCount}/${min})`,
      },
    });
    changes.push({ taskItemId: row.id, roomId: row.roomId, from: row.status, to: "EKSIK" });
  }
  for (const taskId of [...new Set(rows.map((r) => r.taskId))].sort()) await recomputeTaskStatus(tx, taskId);
  await announce(tx, p.hotelId, changes);
  return { itemIds: rows.map((r) => r.id) };
}

/**
 * After a room-check record was deleted: when nothing covers the room that day any more (no remaining
 * SETUP_KONTROL/SARFIYAT_YOK transaction and no completed RoomDnd), its TAMAMLANDI items reopen.
 */
export async function reopenIfUncovered(
  tx: Tx,
  p: { hotelId: string; roomId: string; day: string; userId?: string },
): Promise<{ itemIds: string[] }> {
  const covering = await tx.minibarTransaction.count({
    where: {
      hotelId: p.hotelId,
      roomId: p.roomId,
      type: { in: ["SETUP_KONTROL", "SARFIYAT_YOK"] },
      occurredAt: dayRange(p.day),
    },
  });
  if (covering > 0) return { itemIds: [] };
  const dndDone = await tx.roomDnd.count({
    where: { roomId: p.roomId, date: businessDay(p.day), status: "TAMAMLANDI" },
  });
  if (dndDone > 0) return { itemIds: [] };

  const rows = await lockedItems(tx, {
    roomId: p.roomId,
    status: "TAMAMLANDI",
    task: dayWhere(p.hotelId, p.day),
  });
  if (rows.length === 0) return { itemIds: [] };

  const changes: Change[] = [];
  for (const row of rows) {
    const to: TaskStatus = row.dndCount > 0 ? "DND_BEKLIYOR" : "BEKLIYOR";
    await tx.dailyTaskItem.update({ where: { id: row.id }, data: { status: to, checkedAt: null } });
    await tx.taskStatusLog.create({
      data: {
        taskItemId: row.id,
        from: row.status,
        to,
        userId: p.userId ?? null,
        note: "İşlem silindi — görev yeniden açıldı",
      },
    });
    changes.push({ taskItemId: row.id, roomId: row.roomId, from: row.status, to });
  }
  for (const taskId of [...new Set(rows.map((r) => r.taskId))].sort()) await recomputeTaskStatus(tx, taskId);
  await announce(tx, p.hotelId, changes, p.userId);
  return { itemIds: rows.map((r) => r.id) };
}

/**
 * Parent task status from its items: all TAMAMLANDI -> TAMAMLANDI (+completedAt); nothing open and at
 * least one EKSIK -> EKSIK; at least one TAMAMLANDI/DND_BEKLIYOR -> DEVAM; otherwise BEKLIYOR.
 * A task without items is left alone.
 */
export async function recomputeTaskStatus(tx: Tx, taskId: string): Promise<TaskStatus> {
  await lockTask(tx, taskId);
  const task = await tx.dailyTask.findUniqueOrThrow({
    where: { id: taskId },
    select: { status: true, completedAt: true },
  });
  const items = await tx.dailyTaskItem.findMany({ where: { taskId }, select: { status: true } });
  if (items.length === 0) return task.status;

  const has = (s: TaskStatus) => items.some((i) => i.status === s);
  const open = items.some((i) => OPEN.includes(i.status));
  let next: TaskStatus;
  if (items.every((i) => i.status === "TAMAMLANDI")) next = "TAMAMLANDI";
  else if (!open && has("EKSIK")) next = "EKSIK";
  else if (has("TAMAMLANDI") || has("DND_BEKLIYOR")) next = "DEVAM";
  else next = "BEKLIYOR";

  if (next !== task.status || (next === "TAMAMLANDI") !== (task.completedAt !== null)) {
    await tx.dailyTask.update({
      where: { id: taskId },
      data: { status: next, completedAt: next === "TAMAMLANDI" ? (task.completedAt ?? new Date()) : null },
    });
  }
  return next;
}

// ───────────────────────────── read models ─────────────────────────────

const TASK_TYPES: TaskType[] = ["INHOUSE_KONTROL", "ARRIVAL_KONTROL", "DEPARTURE_KONTROL"];
const pct = (done: number, total: number): number => (total === 0 ? 0 : Math.round((done / total) * 1000) / 10);

export type TaskSummary = {
  total: number;
  completed: number;
  /** BEKLIYOR | DEVAM */
  waiting: number;
  dnd: number;
  /** EKSIK */
  incomplete: number;
  ratePct: number;
  byType: Record<TaskType, { total: number; completed: number; ratePct: number }>;
};

/** Item counts of one business day of one hotel (rate = completed / total, one decimal). */
export async function taskSummary(db: Db, hotelId: string, day: string): Promise<TaskSummary> {
  const items = await db.dailyTaskItem.findMany({
    where: { task: dayWhere(hotelId, day) },
    select: { status: true, task: { select: { type: true } } },
  });
  const byType = Object.fromEntries(
    TASK_TYPES.map((t) => [t, { total: 0, completed: 0, ratePct: 0 }]),
  ) as TaskSummary["byType"];
  let completed = 0;
  let waiting = 0;
  let dnd = 0;
  let incomplete = 0;
  for (const it of items) {
    const t = byType[it.task.type];
    t.total += 1;
    if (it.status === "TAMAMLANDI") {
      completed += 1;
      t.completed += 1;
    } else if (it.status === "DND_BEKLIYOR") dnd += 1;
    else if (it.status === "EKSIK") incomplete += 1;
    else waiting += 1;
  }
  for (const t of TASK_TYPES) byType[t].ratePct = pct(byType[t].completed, byType[t].total);
  return { total: items.length, completed, waiting, dnd, incomplete, ratePct: pct(completed, items.length), byType };
}

export type TaskItemView = {
  itemId: string;
  taskType: TaskType;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorName: string;
  status: TaskStatus;
  arrivalTime: string | null;
  departureTime: string | null;
  dndCount: number;
  lastDndAt: string | null;
  checkedAt: string | null;
  priority: number;
};

const listSchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional(),
    type: z.enum(["INHOUSE_KONTROL", "ARRIVAL_KONTROL", "DEPARTURE_KONTROL"]).optional(),
    filter: z.enum(["ALL", "DND", "TAMAMLANDI", "BEKLEYEN"]).optional(),
    floorId: z.string().min(1).max(64).optional(),
  })
  .strict();

/** Task items of the session hotel (default: today): floor, time, priority, room order. */
export async function listTaskItems(ctx: Ctx, q: z.input<typeof listSchema> = {}): Promise<TaskItemView[]> {
  const parsed = listSchema.safeParse(q);
  if (!parsed.success) throw fromZod(parsed.error);
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, "MB-KAT", "V", hotelId);
  const { day = businessDate(), type, filter = "ALL", floorId } = parsed.data;
  try {
    businessDay(day);
  } catch {
    throw new DomainError("VALIDATION", "Geçersiz tarih");
  }
  const statusFilter: Prisma.DailyTaskItemWhereInput =
    filter === "DND"
      ? { OR: [{ status: "DND_BEKLIYOR" }, { dndCount: { gt: 0 } }] }
      : filter === "TAMAMLANDI"
        ? { status: "TAMAMLANDI" }
        : filter === "BEKLEYEN"
          ? { status: { in: ["BEKLIYOR", "DEVAM", "DND_BEKLIYOR"] } }
          : {};
  const rows = await prisma.dailyTaskItem.findMany({
    where: {
      ...statusFilter,
      task: { ...dayWhere(hotelId, day), ...(type ? { type } : {}) },
      room: { hotelId, ...(floorId ? { floorId } : {}) },
    },
    include: {
      task: { select: { type: true } },
      room: { select: { number: true, floor: { select: { number: true, name: true } } } },
    },
  });
  return rows
    .map((r) => ({
      time: r.arrivalTime ?? r.departureTime ?? "99:99",
      view: {
        itemId: r.id,
        taskType: r.task.type,
        roomId: r.roomId,
        roomNumber: r.room.number,
        floorNumber: r.room.floor.number,
        floorName: r.room.floor.name,
        status: r.status,
        arrivalTime: r.arrivalTime,
        departureTime: r.departureTime,
        dndCount: r.dndCount,
        lastDndAt: r.lastDndAt?.toISOString() ?? null,
        checkedAt: r.checkedAt?.toISOString() ?? null,
        priority: r.priority,
      } satisfies TaskItemView,
    }))
    .sort(
      (a, b) =>
        a.view.floorNumber - b.view.floorNumber ||
        a.time.localeCompare(b.time) ||
        a.view.priority - b.view.priority ||
        a.view.roomNumber.localeCompare(b.view.roomNumber, "tr", { numeric: true }),
    )
    .map((r) => r.view);
}
