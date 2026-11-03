// Past-state helpers of the historical snapshot (day replay): what an order, a task item or a printer looked like at
// an instant, rebuilt from event rows and timestamp columns. Read-only; selects ids, statuses and times only.
import { Prisma, type OrderStatus, type TaskStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Resolver of a past value: `undefined` = the entity did not exist yet at the instant. */
export type StatusAt<S> = (id: string, current: S) => S | undefined;

/**
 * Order status at `asOf` from `OrderEvent` (`DISTINCT ON (order_id) ... WHERE at <= asOf ORDER BY order_id, at DESC`).
 * An order whose events all lie after `asOf` did not exist yet; an order with no event rows at all (legacy data)
 * keeps its current status.
 */
export async function orderStatusesAt(orderIds: string[], asOf: Date): Promise<StatusAt<OrderStatus>> {
  if (orderIds.length === 0) return (_id, current) => current;
  const [latest, traced] = await Promise.all([
    prisma.$queryRaw<{ order_id: string; status: OrderStatus }[]>(Prisma.sql`
      SELECT DISTINCT ON (e.order_id) e.order_id, e."to" AS status
      FROM order_events e
      WHERE e.order_id IN (${Prisma.join(orderIds)}) AND e.at <= ${asOf}
      ORDER BY e.order_id, e.at DESC, e.id DESC`),
    prisma.orderEvent.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true }, distinct: ["orderId"] }),
  ]);
  const at = new Map(latest.map((r) => [r.order_id, r.status]));
  const hasTrace = new Set(traced.map((t) => t.orderId));
  return (id, current) => at.get(id) ?? (hasTrace.has(id) ? undefined : current);
}

/** Task item status at `asOf` from `TaskStatusLog`, falling back to `checkedAt` for items that never logged. */
export async function taskStatusesAt(
  items: { id: string; checkedAt: Date | null }[],
  asOf: Date,
): Promise<StatusAt<TaskStatus>> {
  if (items.length === 0) return (_id, current) => current;
  const ids = items.map((i) => i.id);
  const [latest, logged] = await Promise.all([
    prisma.$queryRaw<{ task_item_id: string; status: TaskStatus }[]>(Prisma.sql`
      SELECT DISTINCT ON (l.task_item_id) l.task_item_id, l."to" AS status
      FROM task_status_logs l
      WHERE l.task_item_id IN (${Prisma.join(ids)}) AND l.created_at <= ${asOf}
      ORDER BY l.task_item_id, l.created_at DESC, l.id DESC`),
    prisma.taskStatusLog.findMany({ where: { taskItemId: { in: ids } }, select: { taskItemId: true }, distinct: ["taskItemId"] }),
  ]);
  const at = new Map(latest.map((r) => [r.task_item_id, r.status]));
  const hasLog = new Set(logged.map((l) => l.taskItemId));
  const checked = new Map(items.map((i) => [i.id, i.checkedAt]));
  return (id, current) => {
    const hit = at.get(id);
    if (hit) return hit;
    if (hasLog.has(id)) return "BEKLIYOR"; // every log lies after the instant: still the initial state
    const c = checked.get(id);
    return c && c.getTime() > asOf.getTime() ? "BEKLIYOR" : current;
  };
}

/** Latest `OperationEvent` per `refId` of one type at or before `asOf`. */
export async function latestOperations(
  hotelId: string,
  type: string,
  asOf: Date,
): Promise<Map<string, Record<string, unknown>>> {
  const rows = await prisma.$queryRaw<{ ref_id: string; data: Record<string, unknown> | null }[]>(Prisma.sql`
    SELECT DISTINCT ON (o.ref_id) o.ref_id, o.data
    FROM operation_events o
    WHERE o.hotel_id = ${hotelId} AND o.type = ${type} AND o.ref_id IS NOT NULL AND o.at <= ${asOf}
    ORDER BY o.ref_id, o.at DESC, o.id DESC`);
  return new Map(rows.map((r) => [r.ref_id, r.data ?? {}]));
}
