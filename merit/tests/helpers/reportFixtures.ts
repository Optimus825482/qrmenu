import { randomUUID } from "node:crypto";
import type {
  DndStatus,
  MinibarTxType,
  OrderKind,
  OrderStatus,
  StockMovementType,
  TaskStatus,
  TaskType,
} from "@/generated/prisma/client";
import { businessDate, businessDay } from "@/lib/time";
import { testDb } from "./db";
import { hotelId, makeOutlet, makeUser } from "./fixtures";

// Direct-Prisma data builders for the report suites: they depend on the schema only, not on P3/P4 services.

async function user(hotelCode: string, username: string, roleCode = "R-KAT") {
  const existing = await testDb.user.findUnique({ where: { username } });
  return existing ?? makeUser({ username, roleCode, hotelCode });
}

async function room(hotelCode: string, number: string) {
  const hid = await hotelId(hotelCode);
  const found = await testDb.room.findUnique({ where: { hotelId_number: { hotelId: hid, number } } });
  if (found) return found;
  const floor =
    (await testDb.floor.findFirst({ where: { hotelId: hid } })) ??
    (await testDb.floor.create({ data: { hotelId: hid, number: 1, name: "Kat 1" } }));
  return testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number } });
}

async function product(name: string, salePrice?: number | null) {
  const found = await testDb.product.findFirst({ where: { name } });
  if (found) return found;
  const group =
    (await testDb.productGroup.findFirst({ where: { name: "Rapor" } })) ??
    (await testDb.productGroup.create({ data: { name: "Rapor" } }));
  return testDb.product.create({
    data: { groupId: group.id, name, salePrice: salePrice === null ? null : (salePrice ?? 3.5) },
  });
}

type ConsumptionOpts = {
  hotelCode: string;
  roomNo: string;
  username: string;
  productName: string;
  consumed: number;
  added: number;
  /** Price snapshot of the line; `null` = unpriced line. */
  salePrice?: number | null;
  type?: MinibarTxType;
  at?: Date;
};

/** One minibar transaction with one item (`consumed` / `added`). */
export async function addConsumption(opts: ConsumptionOpts) {
  const [hid, r, u, p] = await Promise.all([
    hotelId(opts.hotelCode),
    room(opts.hotelCode, opts.roomNo),
    user(opts.hotelCode, opts.username),
    product(opts.productName, opts.salePrice),
  ]);
  return testDb.minibarTransaction.create({
    data: {
      hotelId: hid,
      roomId: r.id,
      userId: u.id,
      type: opts.type ?? "SETUP_KONTROL",
      occurredAt: opts.at ?? new Date(),
      items: {
        create: [
          {
            productId: p.id,
            consumed: opts.consumed,
            added: opts.added,
            salePrice: opts.salePrice === undefined ? 3.5 : opts.salePrice,
          },
        ],
      },
    },
    include: { items: true },
  });
}

/** MyBar welcome fill: `added` units under type MYBAR_KARSILAMA. */
export const addMybar = (opts: Omit<ConsumptionOpts, "type" | "consumed"> & { consumed?: number }) =>
  addConsumption({ ...opts, consumed: opts.consumed ?? 0, type: "MYBAR_KARSILAMA" });

/** Pool movement; the caller passes the signed qty of the P2 `pool.ts` convention. */
export async function addMovement(opts: {
  hotelCode: string;
  username: string;
  productName: string;
  type: StockMovementType;
  qty: number;
  refType?: string;
  refId?: string;
  at?: Date;
}) {
  const [hid, u, p] = await Promise.all([
    hotelId(opts.hotelCode),
    user(opts.hotelCode, opts.username),
    product(opts.productName),
  ]);
  return testDb.hotelStockMovement.create({
    data: {
      hotelId: hid,
      productId: p.id,
      userId: u.id,
      type: opts.type,
      qty: opts.qty,
      refType: opts.refType,
      refId: opts.refId,
      createdAt: opts.at ?? new Date(),
    },
  });
}

/** Active / completed / missed DND of a room on a business day (default today). */
export async function addDnd(opts: {
  hotelCode: string;
  roomNo: string;
  status?: DndStatus;
  count?: number;
  date?: Date;
  taskItemId?: string;
}) {
  const [hid, r] = await Promise.all([hotelId(opts.hotelCode), room(opts.hotelCode, opts.roomNo)]);
  return testDb.roomDnd.create({
    data: {
      hotelId: hid,
      roomId: r.id,
      date: opts.date ?? businessDay(businessDate()),
      status: opts.status ?? "AKTIF",
      count: opts.count ?? 1,
      taskItemId: opts.taskItemId,
    },
  });
}

/** A daily task with one item per `rooms` entry; `completedBy` writes the TAMAMLANDI status log. */
export async function addTaskItems(opts: {
  hotelCode: string;
  type?: TaskType;
  date?: Date;
  rooms: { roomNo: string; status?: TaskStatus; completedBy?: string; at?: Date }[];
}) {
  const hid = await hotelId(opts.hotelCode);
  const date = opts.date ?? businessDay(businessDate());
  const type = opts.type ?? "INHOUSE_KONTROL";
  const task =
    (await testDb.dailyTask.findUnique({ where: { hotelId_date_type: { hotelId: hid, date, type } } })) ??
    (await testDb.dailyTask.create({ data: { hotelId: hid, date, type } }));
  const items = [];
  for (const spec of opts.rooms) {
    const r = await room(opts.hotelCode, spec.roomNo);
    const status = spec.status ?? "BEKLIYOR";
    const item = await testDb.dailyTaskItem.create({
      data: {
        taskId: task.id,
        roomId: r.id,
        status,
        checkedAt: status === "TAMAMLANDI" ? (spec.at ?? new Date()) : null,
      },
    });
    if (status === "TAMAMLANDI" && spec.completedBy) {
      const u = await user(opts.hotelCode, spec.completedBy);
      await testDb.taskStatusLog.create({
        data: { taskItemId: item.id, from: "DEVAM", to: "TAMAMLANDI", userId: u.id, createdAt: spec.at ?? new Date() },
      });
    }
    items.push(item);
  }
  return { task, items };
}

type OrderTimes = Partial<
  Record<
    "approvedAt" | "readyAt" | "servedAt" | "escalatedAt" | "onWayAt" | "deliveredAt" | "createdAt",
    Date
  >
>;

/** An order with items at an outlet (created on first use); `times` set the lifecycle timestamps. */
export async function addOrder(opts: {
  hotelCode: string;
  outletName: string;
  kind?: OrderKind;
  roomNo?: string;
  status?: OrderStatus;
  pricesShown?: boolean;
  items: { name: string; qty: number; unitPrice?: number }[];
  date?: Date;
  times?: OrderTimes;
}) {
  const hid = await hotelId(opts.hotelCode);
  const outlet =
    (await testDb.outlet.findFirst({ where: { hotelId: hid, name: opts.outletName } })) ??
    (await makeOutlet(opts.hotelCode, opts.outletName, "BAR"));
  const kind = opts.kind ?? "MASA";
  const r = opts.roomNo ? await room(opts.hotelCode, opts.roomNo) : null;
  let tableId: string | undefined;
  if (kind === "MASA") {
    const area =
      (await testDb.outletAreaDefinition.findFirst({ where: { outletId: outlet.id } })) ??
      (await testDb.outletAreaDefinition.create({ data: { outletId: outlet.id, type: "KAPALI" } }));
    const table =
      (await testDb.outletTable.findFirst({ where: { outletId: outlet.id } })) ??
      (await testDb.outletTable.create({ data: { outletId: outlet.id, areaId: area.id, label: "M1" } }));
    tableId = table.id;
  }
  const withPrices = opts.pricesShown ?? false;
  const subtotal = withPrices ? opts.items.reduce((sum, i) => sum + i.qty * (i.unitPrice ?? 0), 0) : undefined;
  const nodes: { id: string }[] = [];
  for (const item of opts.items) {
    nodes.push(
      (await testDb.menuNode.findFirst({ where: { outletId: outlet.id, name: item.name } })) ??
        (await testDb.menuNode.create({ data: { outletId: outlet.id, kind: "OGE", name: item.name } })),
    );
  }
  return testDb.order.create({
    data: {
      hotelId: hid,
      outletId: outlet.id,
      kind,
      tableId,
      roomId: r?.id,
      businessDate: opts.date ?? businessDay(businessDate()),
      orderNo: (await testDb.order.count()) + 1,
      status: opts.status ?? "GONDERILDI",
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "10.0.0.1",
      pricesShown: withPrices,
      subtotal,
      ...opts.times,
      items: {
        create: opts.items.map((i, idx) => ({
          menuNodeId: nodes[idx]!.id,
          nameSnapshot: i.name,
          qty: i.qty,
          unitPrice: withPrices ? i.unitPrice : undefined,
        })),
      },
    },
    include: { items: true },
  });
}
