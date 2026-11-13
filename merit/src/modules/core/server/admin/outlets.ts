import { z } from "zod";
import { OutletType, PriceDisplay, type Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import { ensureDefaultCallOptions } from "@/modules/menu/server/callOptionDefaults";
import {
  conflictFromPrisma,
  isConflictError,
  listQuerySchema,
  orderByFor,
  type Page,
  pageArgs,
  parseInput,
  publishDefinition,
  toPage,
  withAdminTx,
} from "./crud";

const SCREEN = "CR-TAN";
const INVALID = "Girilen bilgiler geçersiz";
const NAME_TAKEN = "Bu adda bir outlet zaten var";
const ONE_ROOM_SERVICE = "Her otelde bir oda servisi outleti olabilir";
const CURRENCY_REQUIRED = "Para birimini seçin (3 harfli kod, örn. EUR, TRY, USD)";
const HAS_OPEN_ROOM_ORDERS = "Bu outlette açık oda servisi siparişi var; önce siparişler kapatılmalı";
const HAS_RECORDS =
  "Outlete bağlı masa, alan, sipariş, ekip, oturum veya menü kaydı var; silmek yerine pasife alın";

export type OutletRow = {
  id: string;
  hotelId: string;
  name: string;
  type: OutletType;
  hasMenu: boolean;
  hasOrdering: boolean;
  orderingEnabled: boolean;
  priceDisplay: PriceDisplay;
  currency: string;
  kdsEnabled: boolean;
  autoPrintReceipt: boolean;
  autoPrintKitchen: boolean;
  waiterAssignmentEnabled: boolean;
  tableOccupancyMinutes?: number | null;
  isActive: boolean;
  tableCount: number;
  areaCount: number;
  areas: {
    id: string;
    type: "ACIK" | "KAPALI";
    name: string | null;
    orderingEnabled: boolean | null;
    priceDisplay: PriceDisplay | null;
    tableCount: number;
  }[];
};

const SELECT = {
  id: true,
  hotelId: true,
  name: true,
  type: true,
  hasMenu: true,
  hasOrdering: true,
  orderingEnabled: true,
  priceDisplay: true,
  currency: true,
  kdsEnabled: true,
  autoPrintReceipt: true,
  autoPrintKitchen: true,
  waiterAssignmentEnabled: true,
  tableOccupancyMinutes: true,
  isActive: true,
  areas: {
    select: {
      id: true,
      type: true,
      name: true,
      orderingEnabled: true,
      priceDisplay: true,
      _count: { select: { tables: true } },
    },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  },
  _count: { select: { tables: true, areas: true } },
} satisfies Prisma.OutletSelect;

type OutletWithCount = Prisma.OutletGetPayload<{ select: typeof SELECT }>;

const toRow = ({ _count, areas, ...outlet }: OutletWithCount): OutletRow => ({
  ...outlet,
  areas: areas.map(({ _count: areaCount, ...area }) => ({ ...area, tableCount: areaCount.tables })),
  tableCount: _count.tables,
  areaCount: _count.areas,
});

export const outletSchema = z
  .object({
    /** Read-only: accepted so a form can echo it back, but a different hotel is rejected. */
    hotelId: z.string().optional(),
    name: z.string("Outlet adı gerekli").trim().min(1, "Outlet adı gerekli").max(80, "En fazla 80 karakter olabilir"),
    type: z.enum(OutletType, "Outlet türünü seçin"),
    hasMenu: z.boolean().default(true),
    hasOrdering: z.boolean().default(false),
    orderingEnabled: z.boolean().default(false),
    priceDisplay: z.enum(PriceDisplay, "Fiyat gösterimini seçin").default("INHERIT"),
    /** The form asks it while prices may be shown (required with SHOW); left out it keeps the stored value. */
    currency: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .optional(),
    kdsEnabled: z.boolean().default(false),
    autoPrintReceipt: z.boolean().default(true),
    autoPrintKitchen: z.boolean().default(false),
    waiterAssignmentEnabled: z.boolean().default(false),
    tableOccupancyMinutes: z.coerce.number().int().min(0).max(60).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .transform((value) => {
    if (value.type === "ODA_SERVISI") {
      return {
        ...value,
        hasOrdering: value.hasOrdering ?? true,
        orderingEnabled: value.orderingEnabled ?? true,
        kdsEnabled: value.kdsEnabled ?? true,
      };
    }
    return value;
  })
  .superRefine((value, ctx) => {
    if (value.hasOrdering && !value.hasMenu) {
      ctx.addIssue({
        code: "custom",
        path: ["hasOrdering"],
        message: "Sipariş almak için menü açık olmalıdır",
      });
    }
    const currencyGiven = value.currency !== undefined && value.currency !== "";
    if (currencyGiven ? !/^[A-Z]{3}$/.test(value.currency ?? "") : value.currency === "" && value.priceDisplay === "SHOW") {
      ctx.addIssue({ code: "custom", path: ["currency"], message: CURRENCY_REQUIRED });
    }
  });
export type OutletInput = z.input<typeof outletSchema>;

export const outletListQuerySchema = listQuerySchema;

const ORDER = {
  name: (dir: "asc" | "desc") => ({ name: dir }),
  type: (dir: "asc" | "desc") => ({ type: dir }),
  priceDisplay: (dir: "asc" | "desc") => ({ priceDisplay: dir }),
  orderingEnabled: (dir: "asc" | "desc") => ({ orderingEnabled: dir }),
  tableCount: (dir: "asc" | "desc") => ({ tables: { _count: dir } }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
};

type Db = Pick<Prisma.TransactionClient, "outlet">;

function hotelImmutable(): DomainError {
  return new DomainError("VALIDATION", INVALID, {
    fieldErrors: { hotelId: ["Outlet başka bir otele taşınamaz; yeni outlet oluşturun"] },
  });
}

/** A hotel has at most one ODA_SERVISI outlet (`exceptId` = the outlet being edited). */
async function assertRoomServiceFree(
  db: Db,
  hotelId: string,
  type: OutletType,
  exceptId?: string,
): Promise<void> {
  if (type !== "ODA_SERVISI") return;
  const other = await db.outlet.findFirst({
    where: { hotelId, type: "ODA_SERVISI", ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (other) throw new DomainError("CONFLICT", ONE_ROOM_SERVICE, { fieldErrors: { type: [ONE_ROOM_SERVICE] } });
}

/** Room orders still in flight: the outlet cannot stop being room service or go inactive under them. */
const OPEN_ROOM_STATUSES = ["GONDERILDI", "ONAYLANDI", "HAZIR", "YOLDA"] as const;

async function assertNoOpenRoomOrders(tx: Pick<Prisma.TransactionClient, "order">, outletId: string): Promise<void> {
  const open = await tx.order.findFirst({
    where: { outletId, kind: "ODA_SERVISI", status: { in: [...OPEN_ROOM_STATUSES] } },
    select: { id: true },
  });
  if (open) throw new DomainError("CONFLICT", HAS_OPEN_ROOM_ORDERS);
}

/** The unique index that tripped is not told apart by Prisma: look which rule the input breaks. */
async function conflictMessage(hotelId: string, type: OutletType, exceptId?: string): Promise<string> {
  try {
    await assertRoomServiceFree(prisma, hotelId, type, exceptId);
  } catch (error) {
    if (error instanceof DomainError) return error.message;
    throw error;
  }
  return NAME_TAKEN;
}

export async function list(
  ctx: Ctx,
  hotelId: string,
  rawQuery: z.input<typeof outletListQuerySchema>,
  /** Outlet screens leave room service out: it is an operation of its own with its own apps. */
  options: { withoutRoomService?: boolean } = {},
): Promise<Page<OutletRow>> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const query = parseInput(outletListQuerySchema, rawQuery);
  const where: Prisma.OutletWhereInput = {
    hotelId,
    ...(options.withoutRoomService ? { type: { not: "ODA_SERVISI" } } : {}),
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.outlet.findMany({
      where,
      select: SELECT,
      orderBy: orderByFor<Prisma.OutletOrderByWithRelationInput>(query.sort, ORDER, { name: "asc" }),
      ...pageArgs(query),
    }),
    prisma.outlet.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

export async function create(ctx: Ctx, hotelId: string, raw: OutletInput): Promise<OutletRow> {
  const input = parseInput(outletSchema, raw);
  if (input.hotelId !== undefined && input.hotelId !== hotelId) throw hotelImmutable();
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      await assertRoomServiceFree(tx, hotelId, input.type);
      const created = await tx.outlet.create({
        data: {
          hotelId,
          name: input.name,
          type: input.type,
          hasMenu: input.hasMenu,
          hasOrdering: input.hasOrdering,
          orderingEnabled: input.orderingEnabled,
          priceDisplay: input.priceDisplay,
          ...(input.currency ? { currency: input.currency } : {}),
          kdsEnabled: input.kdsEnabled,
          autoPrintReceipt: input.autoPrintReceipt,
          autoPrintKitchen: input.autoPrintKitchen,
          waiterAssignmentEnabled: input.waiterAssignmentEnabled,
          tableOccupancyMinutes: input.tableOccupancyMinutes === 0 ? null : (input.tableOccupancyMinutes ?? 40),
          isActive: input.isActive ?? true,
        },
        select: SELECT,
      });
      await ensureDefaultCallOptions(tx, created.id);
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "OUTLET_CREATE",
        entity: "Outlet",
        entityId: row.id,
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "outlet", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    // The message needs a query: only pay for it when a constraint actually tripped.
    if (!isConflictError(error)) throw error;
    conflictFromPrisma(error, await conflictMessage(hotelId, input.type));
  }
}

/** Replaces the editable fields; the hotel can never change. */
/** Guest pages follow the outlet's price and ordering switches at once, whichever panel changed them. */
async function publishSwitchChanges(
  tx: Prisma.TransactionClient,
  before: OutletRow,
  after: OutletRow,
): Promise<void> {
  const { hotelId, id: outletId } = after;
  if (before.priceDisplay !== after.priceDisplay || before.currency !== after.currency) {
    await publish({ type: "price.display", hotelId, outletId }, tx);
  }
  if (before.orderingEnabled !== after.orderingEnabled || before.hasOrdering !== after.hasOrdering) {
    await publish(
      { type: "ordering.changed", hotelId, outletId, payload: { enabled: after.orderingEnabled } },
      tx,
    );
  }
  if (before.tableOccupancyMinutes !== after.tableOccupancyMinutes) {
    await publish(
      { type: "table.occupancy", hotelId, outletId, payload: { minutes: after.tableOccupancyMinutes } },
      tx,
    );
  }
}

export async function update(
  ctx: Ctx,
  hotelId: string,
  id: string,
  raw: OutletInput,
): Promise<OutletRow> {
  const input = parseInput(outletSchema, raw);
  if (input.hotelId !== undefined && input.hotelId !== hotelId) throw hotelImmutable();
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      const before = await tx.outlet.findFirst({ where: { id, hotelId }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
      await assertRoomServiceFree(tx, hotelId, input.type, id);
      if (before.type === "ODA_SERVISI" && (input.type !== "ODA_SERVISI" || (before.isActive && input.isActive === false))) {
        await assertNoOpenRoomOrders(tx, id);
      }
      const updated = await tx.outlet.update({
        where: { id },
        data: {
          name: input.name,
          type: input.type,
          hasMenu: input.hasMenu,
          hasOrdering: input.hasOrdering,
          orderingEnabled: input.orderingEnabled,
          priceDisplay: input.priceDisplay,
          ...(input.currency ? { currency: input.currency } : {}),
          kdsEnabled: input.kdsEnabled,
          autoPrintReceipt: input.autoPrintReceipt,
          autoPrintKitchen: input.autoPrintKitchen,
          waiterAssignmentEnabled: input.waiterAssignmentEnabled,
          ...(input.tableOccupancyMinutes !== undefined
            ? { tableOccupancyMinutes: input.tableOccupancyMinutes === 0 ? null : input.tableOccupancyMinutes }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: SELECT,
      });
      const row = toRow(updated);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "OUTLET_UPDATE",
        entity: "Outlet",
        entityId: id,
        before: toRow(before),
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "outlet", id, op: "update" });
      await publishSwitchChanges(tx, toRow(before), row);
      return row;
    });
  } catch (error) {
    if (!isConflictError(error)) throw error;
    conflictFromPrisma(error, await conflictMessage(hotelId, input.type, id));
  }
}

/** Runs `change` on the outlet found by id; the hotel is read from the outlet and authorised as usual. */
async function patchById(
  ctx: Ctx,
  id: string,
  action: string,
  change: (before: OutletRow) => Prisma.OutletUpdateInput | undefined,
  guard?: (tx: Prisma.TransactionClient, before: OutletRow) => Promise<void>,
): Promise<OutletRow> {
  const found = await prisma.outlet.findUnique({ where: { id }, select: { hotelId: true } });
  if (!found) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  const { hotelId } = found;
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    const raw = await tx.outlet.findFirst({ where: { id, hotelId }, select: SELECT });
    if (!raw) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
    const before = toRow(raw);
    const data = change(before);
    if (!data) return before;
    await guard?.(tx, before);
    const row = toRow(await tx.outlet.update({ where: { id }, data, select: SELECT }));
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action,
      entity: "Outlet",
      entityId: id,
      before,
      after: row,
    });
    await publishDefinition(tx, { hotelId, entity: "outlet", id, op: "update" });
    await publishSwitchChanges(tx, before, row);
    return row;
  });
}

export function setActive(ctx: Ctx, id: string, isActive: boolean): Promise<OutletRow> {
  return patchById(
    ctx,
    id,
    "OUTLET_SET_ACTIVE",
    (before) => (before.isActive === isActive ? undefined : { isActive }),
    async (tx, before) => {
      if (!isActive && before.type === "ODA_SERVISI") await assertNoOpenRoomOrders(tx, id);
    },
  );
}

/** The grid's inline "sipariş aç/kapa" switch. */
export function setOrderingEnabled(ctx: Ctx, id: string, enabled: boolean): Promise<OutletRow> {
  return patchById(ctx, id, "OUTLET_UPDATE", (before) =>
    before.orderingEnabled === enabled ? undefined : { orderingEnabled: enabled },
  );
}

export async function remove(ctx: Ctx, hotelId: string, id: string): Promise<void> {
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      const before = await tx.outlet.findFirst({
        where: { id, hotelId },
        select: {
          ...SELECT,
          _count: {
            select: {
              tables: true,
              areas: true,
              orders: true,
              waiterCalls: true,
              members: true,
              assignments: true,
              sessions: true,
              menuNodes: true,
            },
          },
        },
      });
      if (!before) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
      if (Object.values(before._count).some((count) => count > 0)) {
        throw new DomainError("CONFLICT", HAS_RECORDS);
      }
      await tx.outlet.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "OUTLET_DELETE",
        entity: "Outlet",
        entityId: id,
        before: toRow(before),
      });
      await publishDefinition(tx, { hotelId, entity: "outlet", id, op: "delete" });
    });
  } catch (error) {
    // A record added between the count and the delete trips the foreign key.
    conflictFromPrisma(error, HAS_RECORDS);
  }
}

export { remove as delete };
