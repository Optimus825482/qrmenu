import { z } from "zod";
import type { GuestRecordKind, Prisma, TaskType } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { publishRadar } from "@/modules/radar/publish";
import { TASK_TYPE_FOR_KIND, UPLOAD_KINDS } from "../constants";
import { TASK_GENERATED } from "../events";
import { setDailyTaskReconciler } from "./occupancyUpload";
import { recomputeTaskStatus } from "./tasks";

/*
 * Daily task reconciliation. The occupancy uploads (IN_HOUSE / ARRIVAL / DEPARTURE guest records) are
 * the single source; `reconcileDailyTasks` makes the day's three DailyTasks and their items match
 * them, idempotently, under one advisory lock per hotel and day. A late upload ADDS rooms; items that
 * already moved on (TAMAMLANDI / DND_BEKLIYOR / EKSIK / DEVAM) are never touched or removed.
 */

type Tx = Prisma.TransactionClient;

const SCREEN_UPLOAD = "MB-DOL";
const TASK_TYPES: readonly TaskType[] = UPLOAD_KINDS.map((k) => TASK_TYPE_FOR_KIND[k]);

export type ReconcileResult = {
  /** DailyTask rows created. */
  created: number;
  /** Items added to tasks that already existed (late upload). */
  added: number;
  /** Pending items removed because their guest record is gone (plus tasks left empty). */
  removed: number;
  /** Pending items whose times / priority changed. */
  updated: number;
};

type Wanted = { guestRecordId: string; arrivalTime: string | null; departureTime: string | null; priority: number };

/** `@db.Date` değerleri `businessDay(day)` ile aynı anı taşır; karşılaştırma `getTime()` üzerinden yapılır (UTC dize dilimi yok). */
const sameDay = (d: Date, dayValue: Date): boolean => d.getTime() === dayValue.getTime();
const timeKey = (t: string | null): number => {
  const m = t ? /^(\d{1,2}):(\d{2})/.exec(t) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
};

type Rec = {
  id: string;
  roomId: string;
  kind: GuestRecordKind;
  arrivalDate: Date;
  arrivalTime: string | null;
  departureDate: Date;
  departureTime: string | null;
};

/** Wanted items per task type: one record per room (the newest: `records` is createdAt desc), active rooms only. */
function wantedByType(records: Rec[], day: string): Map<TaskType, Map<string, Wanted>> {
  const out = new Map<TaskType, Map<string, Wanted>>(TASK_TYPES.map((t) => [t, new Map()]));
  for (const r of records) {
    const type = TASK_TYPE_FOR_KIND[r.kind];
    const dayValue = businessDay(day);
    const covers = r.arrivalDate.getTime() <= dayValue.getTime() && dayValue.getTime() <= r.departureDate.getTime();
    const fits =
      r.kind === "IN_HOUSE" ? covers : r.kind === "ARRIVAL" ? sameDay(r.arrivalDate, dayValue) : sameDay(r.departureDate, dayValue);
    if (!fits) continue;
    const map = out.get(type)!;
    if (map.has(r.roomId)) continue;
    map.set(r.roomId, {
      guestRecordId: r.id,
      arrivalTime: r.kind === "ARRIVAL" ? r.arrivalTime : null,
      departureTime: r.kind === "DEPARTURE" ? r.departureTime : null,
      priority: 999,
    });
  }
  // departures: priority 1..n by departure time, rooms without a time last
  const dep = out.get("DEPARTURE_KONTROL")!;
  [...dep.entries()]
    .sort(([, a], [, b]) => timeKey(a.departureTime) - timeKey(b.departureTime))
    .forEach(([, w], i) => {
      w.priority = i + 1;
    });
  return out;
}

async function reconcileInTx(
  tx: Tx,
  hotelId: string,
  day: string,
  actorId: string | undefined,
): Promise<{ result: ReconcileResult; newByType: Map<TaskType, number> }> {
  const date = businessDay(day);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tasks:${hotelId}${day}`}))`;

  const records = await tx.guestRecord.findMany({
    where: { hotelId, arrivalDate: { lte: date }, departureDate: { gte: date }, room: { isActive: true } },
    select: {
      id: true,
      roomId: true,
      kind: true,
      arrivalDate: true,
      arrivalTime: true,
      departureDate: true,
      departureTime: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  // The range above is the superset; `wantedByType` applies the exact per-kind rule.
  const wanted = wantedByType(records, day);

  const existingTasks = await tx.dailyTask.findMany({
    where: { hotelId, date },
    select: { id: true, type: true },
    orderBy: { id: "asc" },
  });
  // Lock order = tasks.ts: items first (id order), then tasks (id order).
  const taskIds = existingTasks.map((t) => t.id);
  if (taskIds.length > 0) {
    await tx.$queryRaw`SELECT id FROM daily_task_items WHERE task_id = ANY(${taskIds}::text[]) ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM daily_tasks WHERE id = ANY(${taskIds}::text[]) ORDER BY id FOR UPDATE`;
  }

  const result: ReconcileResult = { created: 0, added: 0, removed: 0, updated: 0 };
  const newByType = new Map<TaskType, number>();
  const touched = new Set<string>();

  for (const type of TASK_TYPES) {
    const want = wanted.get(type)!;
    let task = existingTasks.find((t) => t.type === type);
    const items = task
      ? await tx.dailyTaskItem.findMany({
          where: { taskId: task.id },
          select: { id: true, roomId: true, status: true, arrivalTime: true, departureTime: true, priority: true, guestRecordId: true },
        })
      : [];
    const byRoom = new Map(items.map((i) => [i.roomId, i]));

    // remove pending items without a record anymore
    const gone = items.filter((i) => !want.has(i.roomId) && i.status === "BEKLIYOR");
    if (gone.length > 0) {
      await tx.dailyTaskItem.deleteMany({ where: { id: { in: gone.map((g) => g.id) } } });
      result.removed += gone.length;
      touched.add(task!.id);
    }

    // update pending items whose times / priority moved
    for (const [roomId, w] of want) {
      const item = byRoom.get(roomId);
      if (!item || item.status !== "BEKLIYOR") continue;
      if (
        item.arrivalTime !== w.arrivalTime ||
        item.departureTime !== w.departureTime ||
        item.priority !== w.priority ||
        item.guestRecordId !== w.guestRecordId
      ) {
        await tx.dailyTaskItem.update({
          where: { id: item.id },
          data: {
            arrivalTime: w.arrivalTime,
            departureTime: w.departureTime,
            priority: w.priority,
            guestRecordId: w.guestRecordId,
          },
        });
        result.updated += 1;
      }
    }

    // add rooms the task does not have yet
    const missing = [...want.entries()].filter(([roomId]) => !byRoom.has(roomId));
    if (missing.length === 0) continue;
    const wasNew = !task;
    if (!task) {
      task = await tx.dailyTask.upsert({
        where: { hotelId_date_type: { hotelId, date, type } },
        create: { hotelId, date, type, status: "BEKLIYOR" },
        update: {},
        select: { id: true, type: true },
      });
      result.created += 1;
    }
    const rows = await tx.dailyTaskItem.createManyAndReturn({
      data: missing.map(([roomId, w]) => ({
        taskId: task.id,
        roomId,
        guestRecordId: w.guestRecordId,
        status: "BEKLIYOR" as const,
        arrivalTime: w.arrivalTime,
        departureTime: w.departureTime,
        priority: w.priority,
      })),
      select: { id: true },
    });
    await tx.taskStatusLog.createMany({
      data: rows.map((r) => ({
        taskItemId: r.id,
        from: null,
        to: "BEKLIYOR" as const,
        userId: actorId ?? null,
        note: "Görev oluşturuldu",
      })),
    });
    if (!wasNew) result.added += rows.length;
    newByType.set(type, rows.length);
    touched.add(task.id);
  }

  // tasks left without items go; the others get their status recomputed (a late room reopens a done task)
  for (const taskId of [...touched].sort()) {
    const remaining = await tx.dailyTaskItem.count({ where: { taskId } });
    if (remaining === 0) await tx.dailyTask.delete({ where: { id: taskId } });
    else await recomputeTaskStatus(tx, taskId);
  }
  return { result, newByType };
}

/**
 * Makes the day's tasks match the uploaded occupancy (see file comment). Safe to run repeatedly and
 * concurrently: the second run finds nothing to do. Notifies R-KAT once per run that added items.
 */
export async function reconcileDailyTasks(
  hotelId: string,
  day: string,
  opts: { actorId?: string } = {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of the occupancy hook signature
  _now: Date = new Date(),
): Promise<ReconcileResult> {
  businessDay(day); // VALIDATION on a malformed day
  return prisma.$transaction(async (tx) => {
    const { result, newByType } = await reconcileInTx(tx, hotelId, day, opts.actorId);
    const newItems = [...newByType.values()].reduce((a, b) => a + b, 0);

    if (result.created + result.added + result.removed + result.updated > 0) {
      await audit(tx, {
        userId: opts.actorId,
        hotelId,
        action: "TASKS_GENERATED",
        entity: "DailyTask",
        entityId: `${hotelId}:${day}`,
        after: { day, ...result, newItems },
      });
    }
    if (newItems > 0) {
      const hotel = await tx.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { name: true } });
      await notify(
        {
          recipients: { hotelId, roleCodes: ["R-KAT"] },
          type: TASK_GENERATED,
          title: `${hotel.name} için ${newItems} yeni görev`,
          body: `Bugün için ${newItems} oda kontrol görevi oluşturuldu.`,
          refType: "MinibarDay",
          refId: `${hotelId}:${day}`,
        },
        tx,
      );
      await publishRadar(
        "task.generated",
        { hotelId },
        { day, types: [...newByType.keys()], itemCount: newItems },
        tx,
      );
    }
    return result;
  });
}

const regenerateSchema = z
  .object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional() })
  .strict();

/** "Görevleri yeniden üret": depot staff re-runs the reconciliation for the session hotel (default: today). */
export async function regenerateTasks(
  ctx: Ctx,
  input: z.input<typeof regenerateSchema> = {},
  now: Date = new Date(),
): Promise<ReconcileResult & { day: string }> {
  const parsed = regenerateSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN_UPLOAD, "D", hotelId);
  const day = parsed.data.day ?? businessDate(now);
  try {
    businessDay(day);
  } catch {
    throw new DomainError("VALIDATION", "Geçersiz tarih");
  }
  const result = await reconcileDailyTasks(hotelId, day, { actorId: ctx.user.id }, now);
  return { ...result, day };
}

/** Daily job body: reconciles today for every active hotel with the MINIBAR module. */
export async function reconcileAllHotels(now: Date = new Date()): Promise<{ hotelCount: number; created: number; added: number }> {
  const day = businessDate(now);
  const hotels = await prisma.hotel.findMany({
    where: { isActive: true, modules: { some: { moduleKey: "MINIBAR", enabled: true } } },
    select: { id: true },
  });
  let created = 0;
  let added = 0;
  for (const h of hotels) {
    // Bir otelin hatası diğerlerini durdurmaz (00:01 işi otel başına yalıtılır).
    try {
      const r = await reconcileDailyTasks(h.id, day, {}, now);
      created += r.created;
      added += r.added;
    } catch (err) {
      console.error(`[minibar.task-gen] otel ${h.id} uzlaştırma hatası`, err);
    }
  }
  return { hotelCount: hotels.length, created, added };
}

// Occupancy uploads trigger the reconciliation through this hook (no hard import cycle).
setDailyTaskReconciler(reconcileDailyTasks);
