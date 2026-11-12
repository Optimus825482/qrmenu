import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { getSettings } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { publishRadar } from "@/modules/radar/publish";
import { QTY_BUTTON_MAX } from "../constants";
import { dayRange } from "./dates";
import { autoCompleteDnd } from "./dnd";
import { lockRow } from "./minibarCommon";
import type { CorrectionRequestItem, RoomCheckHistoryItem } from "./minibarTypes";
import { lockStocks, restoreStock, takeManyFromPool } from "./pool";
import { addedToday, type Checklist, capacityByProduct, loadRoomChecklist } from "./roomChecklist";
import { assertRoomVerified, hasRoomProof } from "./roomVerification";
import { completeOpenItemsForRoom, reopenIfUncovered } from "./tasks";

/*
 * The floor attendant's room check: +N replacement (several lines at once), "Sarfiyat Yok", deleting or
 * changing one's own record of the day, the "islemlerim" list and the past-day correction requests.
 *
 * Write pattern: zod (strict) -> assertCan -> ONE transaction (room row lock first, then the pool rows of
 * ALL products involved in one product-ordered lock) -> audit -> publish. The room lock serialises the
 * checks of a room, so the daily capacity (setup quantity x cabinet copies, summed over ALL staff) cannot
 * be raced; `MinibarTransaction.clientRequestId` is unique, a repeated request returns the first result
 * without side effects. Nothing here returns a price.
 */

type Tx = Prisma.TransactionClient;

const SCREEN = "MB-TUK";
const DEPOT_ROLES = ["R-DEP", "R-OTM"];
const id = z.string().min(1).max(64);

// ---------------------------------------------------------------- shared helpers

export type RoomRef = { id: string; hotelId: string; number: string; floorId: string };

/** The room, only when it belongs to a hotel of the session scope (anything else is "not found"). */
async function resolveRoom(ctx: Ctx, roomId: string): Promise<RoomRef> {
  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId: { in: ctx.hotelIds } },
    select: { id: true, hotelId: true, number: true, floorId: true },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  return room;
}

const isUnique = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

/** Closes the user's open check of the room (ACIK, started with `startRoomCheck`) or records a finished one. */
async function finishRoomCheck(
  tx: Tx,
  p: {
    roomId: string;
    userId: string;
    day: string;
    type: "URUN_EKLENDI" | "SARFIYAT_YOK";
    transactionId: string;
    now: Date;
  },
) {
  const date = businessDay(p.day);
  const open = await tx.roomCheck.findFirst({
    where: { roomId: p.roomId, userId: p.userId, checkDate: date, type: "ACIK", endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (open) {
    await tx.roomCheck.update({
      where: { id: open.id },
      data: { type: p.type, transactionId: p.transactionId, endedAt: p.now },
    });
  } else {
    await tx.roomCheck.create({
      data: {
        roomId: p.roomId,
        userId: p.userId,
        transactionId: p.transactionId,
        checkDate: date,
        type: p.type,
        startedAt: p.now,
        endedAt: p.now,
      },
    });
  }
}

async function poolRemainingOf(db: Tx | typeof prisma, hotelId: string, productIds: string[]) {
  const rows = await db.hotelStock.findMany({
    where: { hotelId, productId: { in: productIds } },
    select: { productId: true, remainingQty: true },
  });
  const out: Record<string, number> = {};
  for (const p of productIds) out[p] = 0;
  for (const r of rows) out[r.productId] = r.remainingQty;
  return out;
}

async function announceDone(
  tx: Tx,
  p: {
    room: RoomRef;
    userId: string;
    checkType: "URUN_EKLENDI" | "SARFIYAT_YOK";
    addedQty: number;
    taskItemId?: string;
  },
) {
  await publishRadar(
    "roomcheck.done",
    { hotelId: p.room.hotelId, roomId: p.room.id },
    {
      roomId: p.room.id,
      roomNumber: p.room.number,
      floorId: p.room.floorId,
      checkType: p.checkType,
      addedQty: p.addedQty,
      ...(p.taskItemId ? { taskItemId: p.taskItemId, taskStatus: "TAMAMLANDI" as const } : {}),
      byUserId: p.userId,
    },
    tx,
  );
}

// ---------------------------------------------------------------- start

/** Opens the room check of the user: every open (ACIK) check the user left behind is dropped first. */
export async function startRoomCheck(
  ctx: Ctx,
  roomId: string,
  now: Date = new Date(),
): Promise<{ checkId: string }> {
  const room = await resolveRoom(ctx, roomId);
  await assertCan(ctx, SCREEN, "O", room.hotelId);
  const date = businessDay(businessDate(now));
  return prisma.$transaction(async (tx) => {
    await tx.roomCheck.deleteMany({ where: { userId: ctx.user.id, type: "ACIK", endedAt: null } });
    const check = await tx.roomCheck.create({
      data: { roomId: room.id, userId: ctx.user.id, checkDate: date, type: "ACIK", startedAt: now },
      select: { id: true },
    });
    return { checkId: check.id };
  });
}

// ---------------------------------------------------------------- view

export type RoomCheckBadge = {
  kind: "KONTROL_EDILDI" | "DND" | "SARFIYAT_YOK" | "BEKLIYOR";
  at?: string;
  dndCount?: number;
  required?: number;
  incomplete?: boolean;
};

export type CheckButton = { n: number; enabled: boolean };

export type CheckItemView = {
  productId: string;
  productName: string;
  unit: string;
  groupName: string;
  /** Setup quantity of ONE cabinet. */
  setupQty: number;
  /** Daily replacement capacity of the product in this room (setup x cabinet copies, all setups). */
  capacity: number;
  addedToday: number;
  allowedLeft: number;
  poolRemaining: number;
  buttons: CheckButton[];
};

export type RoomCheckView = {
  room: {
    id: string;
    number: string;
    floorId: string;
    floorName: string;
    floorNumber: number;
    roomTypeId: string | null;
    roomTypeName: string;
    cabinetCount: number;
  };
  badge: RoomCheckBadge;
  emptyRoomWarning: string | null;
  /** Set when the room has no room type / setup assignment (the check list is empty then). */
  checklistError: string | null;
  /** One entry per setup copy (an in-cabinet setup repeats once per cabinet). */
  checklist: {
    key: string;
    setupId: string;
    name: string;
    label: string;
    isInsideCabinet: boolean;
    copy: number;
    copies: number;
    items: CheckItemView[];
  }[];
  /** Legacy shape (one entry per setup) kept for the current page; a superset of the old fields. */
  setups: {
    setupId: string;
    setupName: string;
    isInsideCabinet: boolean;
    items: (CheckItemView & {
      targetQty: number;
      hotelStockQty: number;
      addedQty: number;
      replenishedToday: number;
    })[];
  }[];
  guestStatus: { kind: string; arrivalTime: string | null; departureTime: string | null; note: string | null };
  taskItem: {
    id: string;
    status: string;
    dndCount: number;
    lastDndAt: string | null;
    checkedAt: string | null;
    dndAllowed: boolean;
    dndWaitMinutes: number;
  } | null;
  mybar: { id: string; createdAt: string; notes: string | null; items: { productName: string; qty: number }[] } | null;
  requireQrForControl?: boolean;
  /** The user holds a fresh room verification proof (QR scan); the writers ask for it while QR is required. */
  qrVerified: boolean;
};

/** Everything the room check screen needs: badge, check list with copies, allowed-left and pool per product. */
export async function getRoomCheckView(ctx: Ctx, roomId: string, now: Date = new Date()): Promise<RoomCheckView> {
  const ref = await resolveRoom(ctx, roomId);
  await assertCan(ctx, SCREEN, "V", ref.hotelId);
  const hotelId = ref.hotelId;
  const day = businessDate(now);
  const date = businessDay(day);

  const room = await prisma.room.findUniqueOrThrow({
    where: { id: roomId },
    include: {
      floor: { select: { id: true, name: true, number: true } },
      roomType: { select: { id: true, name: true, cabinetCount: true } },
    },
  });

  let checklist: Checklist | null = null;
  let checklistError: string | null = null;
  try {
    checklist = await loadRoomChecklist(prisma, roomId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "VALIDATION") checklistError = e.message;
    else throw e;
  }
  const caps = checklist ? capacityByProduct(checklist) : new Map<string, number>();
  const done = await addedToday(prisma, roomId, day);
  const pool = await poolRemainingOf(prisma, hotelId, [...caps.keys()]);

  const itemView = (i: {
    productId: string;
    name: string;
    unit: string;
    groupName: string;
    setupQty: number;
  }): CheckItemView => {
    const capacity = caps.get(i.productId) ?? 0;
    const added = done.get(i.productId) ?? 0;
    const allowedLeft = Math.max(0, capacity - added);
    const poolRemaining = pool[i.productId] ?? 0;
    return {
      productId: i.productId,
      productName: i.name,
      unit: i.unit,
      groupName: i.groupName,
      setupQty: i.setupQty,
      capacity,
      addedToday: added,
      allowedLeft,
      poolRemaining,
      buttons: Array.from({ length: Math.min(i.setupQty, QTY_BUTTON_MAX) }, (_, k) => ({
        n: k + 1,
        enabled: poolRemaining >= k + 1 && allowedLeft >= k + 1,
      })),
    };
  };

  const copies = checklist?.setups ?? [];
  const checklistView = copies.map((s) => ({
    key: s.key,
    setupId: s.setupId,
    name: s.name,
    label: s.label,
    isInsideCabinet: s.isInsideCabinet,
    copy: s.copy,
    copies: s.copies,
    items: s.items.map(itemView),
  }));
  const seen = new Set<string>();
  const setups: RoomCheckView["setups"] = [];
  for (const s of copies) {
    if (seen.has(s.setupId)) continue;
    seen.add(s.setupId);
    setups.push({
      setupId: s.setupId,
      setupName: s.name,
      isInsideCabinet: s.isInsideCabinet,
      items: s.items.map((i) => {
        const v = itemView(i);
        return {
          ...v,
          targetQty: i.setupQty * s.copies,
          hotelStockQty: v.poolRemaining,
          addedQty: 0,
          replenishedToday: v.addedToday,
        };
      }),
    });
  }

  const taskWhere = { hotelId, date };
  const [taskItem, hotelItems, mybar, lastTx, dnd, settings, proof] = await Promise.all([
    prisma.dailyTaskItem.findFirst({ where: { roomId, task: taskWhere }, include: { guestRecord: true } }),
    prisma.dailyTaskItem.count({ where: { task: taskWhere } }),
    prisma.mybarRequest.findFirst({
      where: { roomId, businessDate: date, status: "BEKLEMEDE" },
      include: { items: { include: { product: { select: { name: true } } } } },
    }),
    prisma.minibarTransaction.findFirst({
      where: { roomId, type: { in: ["SETUP_KONTROL", "SARFIYAT_YOK"] }, occurredAt: dayRange(day) },
      orderBy: { occurredAt: "desc" },
      select: { type: true, occurredAt: true },
    }),
    prisma.roomDnd.findUnique({ where: { roomId_date: { roomId, date } } }),
    getSettings(["dnd.minChecks", "dnd.recheckMinutes", "minibar.requireQrForControl"], hotelId),
    hasRoomProof(prisma, { userId: ctx.user.id, roomId }, now),
  ]);
  const required = settings["dnd.minChecks"];

  let badge: RoomCheckBadge = { kind: "BEKLIYOR" };
  if (lastTx) {
    badge = {
      kind: lastTx.type === "SARFIYAT_YOK" ? "SARFIYAT_YOK" : "KONTROL_EDILDI",
      at: lastTx.occurredAt.toISOString(),
    };
  } else if (dnd?.status === "TAMAMLANDI") {
    badge = { kind: "KONTROL_EDILDI", at: dnd.lastAt.toISOString(), dndCount: dnd.count, required };
  } else if (dnd?.status === "AKTIF") {
    badge = { kind: "DND", at: dnd.lastAt.toISOString(), dndCount: dnd.count, required };
  } else if (dnd?.status === "EKSIK") {
    badge = { kind: "DND", at: dnd.lastAt.toISOString(), dndCount: dnd.count, required, incomplete: true };
  }

  // Same rule as markDnd: the next DND mark of an active DND waits `dnd.recheckMinutes` after the last one (any user).
  let dndWaitMinutes = 0;
  const lastDndAt = dnd?.status === "AKTIF" ? dnd.lastAt : taskItem?.status === "DND_BEKLIYOR" ? taskItem.lastDndAt : null;
  if (lastDndAt) {
    const leftMs = lastDndAt.getTime() + settings["dnd.recheckMinutes"] * 60_000 - now.getTime();
    dndWaitMinutes = leftMs > 0 ? Math.ceil(leftMs / 60_000) : 0;
  }
  const dndAllowed = !lastTx && (!dnd || dnd.status === "AKTIF") && dndWaitMinutes === 0;

  return {
    room: {
      id: room.id,
      number: room.number,
      floorId: room.floor.id,
      floorName: room.floor.name,
      floorNumber: room.floor.number,
      roomTypeId: room.roomType?.id ?? null,
      roomTypeName: room.roomType?.name ?? "Standart Oda",
      cabinetCount: Math.max(room.roomType?.cabinetCount ?? 1, 1),
    },
    badge,
    emptyRoomWarning:
      hotelItems > 0 && !taskItem
        ? "Bu oda bugünkü doluluk listesinde yok; boş görünüyor. Yine de kontrol edebilirsiniz."
        : null,
    requireQrForControl: Boolean(settings["minibar.requireQrForControl"]),
    qrVerified: proof,
    checklistError,
    checklist: checklistView,
    setups,
    guestStatus: {
      kind: taskItem?.guestRecord?.kind ?? "EMPTY",
      arrivalTime: taskItem?.arrivalTime ?? null,
      departureTime: taskItem?.departureTime ?? null,
      note: taskItem?.note ?? null,
    },
    taskItem: taskItem
      ? {
          id: taskItem.id,
          status: taskItem.status,
          dndCount: taskItem.dndCount,
          lastDndAt: taskItem.lastDndAt?.toISOString() ?? null,
          checkedAt: taskItem.checkedAt?.toISOString() ?? null,
          dndAllowed,
          dndWaitMinutes,
        }
      : null,
    mybar: mybar
      ? {
          id: mybar.id,
          createdAt: mybar.createdAt.toISOString(),
          notes: mybar.note,
          items: mybar.items.map((i) => ({ productName: i.product.name, qty: i.requestedQty })),
        }
      : null,
  };
}

// ---------------------------------------------------------------- +N replacement

const replacementSchema = z
  .strictObject({
    roomId: id,
    items: z
      .array(
        z.strictObject({ productId: id, setupId: id, qty: z.number().int().min(1, "Adet en az 1 olmalı").max(999) }),
      )
      .min(1, "En az bir ürün seçin")
      .max(50),
    clientRequestId: z.uuid(),
    note: z.string().trim().max(300).optional(),
  })
  .superRefine((v, c) => {
    const seen = new Set<string>();
    for (const [i, it] of v.items.entries()) {
      if (seen.has(it.productId)) {
        c.addIssue({ code: "custom", path: ["items", i, "productId"], message: "Aynı ürün birden fazla satırda olamaz" });
      }
      seen.add(it.productId);
    }
  });

export type ReplacementResult = {
  transactionId: string;
  added: number;
  poolRemaining: Record<string, number>;
  taskCompleted: boolean;
  dndCompleted: boolean;
  replayed: boolean;
};

/** The first result of an already recorded request (no side effect). */
async function replayOf(
  tx: Tx,
  existing: {
    id: string;
    hotelId: string;
    roomId: string;
    occurredAt: Date;
    items: { productId: string; added: number }[];
  },
): Promise<ReplacementResult> {
  const date = businessDay(businessDate(existing.occurredAt));
  const [doneItems, doneDnd] = await Promise.all([
    tx.dailyTaskItem.count({
      where: { roomId: existing.roomId, status: "TAMAMLANDI", task: { hotelId: existing.hotelId, date } },
    }),
    tx.roomDnd.count({ where: { roomId: existing.roomId, date, status: "TAMAMLANDI" } }),
  ]);
  return {
    transactionId: existing.id,
    added: existing.items.reduce((a, i) => a + i.added, 0),
    poolRemaining: await poolRemainingOf(
      tx,
      existing.hotelId,
      existing.items.map((i) => i.productId),
    ),
    taskCompleted: doneItems > 0,
    dndCompleted: doneDnd > 0,
    replayed: true,
  };
}

async function findReplay(tx: Tx, ctx: Ctx, roomId: string, clientRequestId: string) {
  const existing = await tx.minibarTransaction.findUnique({
    where: { clientRequestId },
    select: {
      id: true,
      hotelId: true,
      roomId: true,
      userId: true,
      occurredAt: true,
      items: { select: { productId: true, added: true } },
    },
  });
  if (!existing) return null;
  if (existing.roomId !== roomId || existing.userId !== ctx.user.id) {
    throw new DomainError("CONFLICT", "Bu istek kimliği başka bir işlemde kullanılmış");
  }
  return replayOf(tx, existing);
}

/**
 * Books a replacement inside the caller's transaction (room row already locked, the caller has authorised it):
 * the room-check record, the hotel stock, the room check, DND and the day's task. Used by the attendant's own
 * +N (`addReplacement`) and by an approved manual entry request, where the attendant could not scan the room.
 */
export async function bookReplacementTx(
  tx: Tx,
  p: {
    room: RoomRef;
    /** The attendant who checked the room: owner of the record. */
    userId: string;
    items: { productId: string; setupId: string; qty: number }[];
    clientRequestId: string;
    note?: string;
    now: Date;
    manualRequestId?: string;
  },
): Promise<ReplacementResult> {
  const { room, items, clientRequestId, note, now } = p;
  const day = businessDate(now);
  const checklist = await loadRoomChecklist(tx, room.id);
  const caps = capacityByProduct(checklist);
  const done = await addedToday(tx, room.id, day);

  const lines = items.map((it) => {
    const setup = checklist.setups.find(
      (s) => s.setupId === it.setupId && s.items.some((i) => i.productId === it.productId),
    );
    if (!setup) {
      throw new DomainError("VALIDATION", "Ürün bu setup'ta bulunamadı", {
        fieldErrors: { productId: [it.productId] },
      });
    }
    return { ...it, setupQty: setup.items.find((i) => i.productId === it.productId)!.setupQty };
  });
  for (const l of lines) {
    const capacity = caps.get(l.productId) ?? 0;
    const added = done.get(l.productId) ?? 0;
    if (added + l.qty > capacity) {
      throw new DomainError(
        "DAILY_LIMIT",
        `Setup miktarı aşılamaz: setup ${capacity}, bugün eklenen ${added}, kalan ${Math.max(0, capacity - added)}`,
      );
    }
  }

  const prices = await tx.product.findMany({
    where: { id: { in: lines.map((l) => l.productId) } },
    select: { id: true, purchasePrice: true, salePrice: true },
  });
  const priceOf = new Map(prices.map((p) => [p.id, p]));
  const total = lines.reduce((a, l) => a + l.qty, 0);

  const created = await tx.minibarTransaction.create({
    data: {
      hotelId: room.hotelId,
      roomId: room.id,
      userId: p.userId,
      type: "SETUP_KONTROL",
      note: note || `${total} ürün eksik tamamlandı.`,
      clientRequestId,
      occurredAt: now,
      items: {
        create: lines.map((l) => ({
          productId: l.productId,
          setupId: l.setupId,
          setupQty: l.setupQty,
          startStock: Math.max(0, l.setupQty - l.qty),
          endStock: l.setupQty,
          consumed: l.qty,
          added: l.qty,
          purchasePrice: priceOf.get(l.productId)?.purchasePrice ?? null,
          salePrice: priceOf.get(l.productId)?.salePrice ?? null,
        })),
      },
    },
    select: { id: true },
  });

  await takeManyFromPool(
    tx,
    {
      hotelId: room.hotelId,
      userId: p.userId,
      type: "KULLANIM",
      refType: "MinibarTransaction",
      refId: created.id,
      note: `Oda kontrolü: Oda ${room.number}`,
    },
    lines.map((l) => ({ productId: l.productId, qty: l.qty })),
    now,
  );

  await finishRoomCheck(tx, {
    roomId: room.id,
    userId: p.userId,
    day,
    type: "URUN_EKLENDI",
    transactionId: created.id,
    now,
  });
  const dndCompleted = await autoCompleteDnd(
    tx,
    { hotelId: room.hotelId, roomId: room.id, day, userId: p.userId, reason: "IKAME" },
    now,
  );
  const moved = await completeOpenItemsForRoom(tx, {
    hotelId: room.hotelId,
    roomId: room.id,
    day,
    userId: p.userId,
    reason: "IKAME",
    now,
  });

  await audit(tx, {
    userId: p.userId,
    hotelId: room.hotelId,
    action: "MINIBAR_REPLACE",
    entity: "MinibarTransaction",
    entityId: created.id,
    after: {
      roomId: room.id,
      roomNumber: room.number,
      items: lines.map((l) => ({ productId: l.productId, setupId: l.setupId, qty: l.qty })),
      clientRequestId,
      ...(p.manualRequestId ? { manualRequestId: p.manualRequestId } : {}),
    },
  });
  await announceDone(tx, {
    room,
    userId: p.userId,
    checkType: "URUN_EKLENDI",
    addedQty: total,
    taskItemId: moved.itemIds[0],
  });

  return {
    transactionId: created.id,
    added: total,
    poolRemaining: await poolRemainingOf(
      tx,
      room.hotelId,
      lines.map((l) => l.productId),
    ),
    taskCompleted: moved.itemIds.length > 0,
    dndCompleted,
    replayed: false,
  };
}

/**
 * +N replacement: one or several products in one atomic call. The daily capacity of a product is its setup
 * quantity over all cabinet copies, minus what any staff member already added to the room today.
 * The same `clientRequestId` returns the first result and changes nothing.
 */
export async function addReplacement(ctx: Ctx, input: unknown, now: Date = new Date()): Promise<ReplacementResult> {
  const parsed = replacementSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { roomId, items, clientRequestId, note } = parsed.data;
  const room = await resolveRoom(ctx, roomId);
  await assertCan(ctx, SCREEN, "O", room.hotelId);

  const run = () =>
    prisma.$transaction(async (tx): Promise<ReplacementResult> => {
      await lockRow(tx, "rooms", room.id);
      const replay = await findReplay(tx, ctx, room.id, clientRequestId);
      if (replay) return replay;
      await assertRoomVerified({ userId: ctx.user.id, roomId: room.id, hotelId: room.hotelId }, now, tx);

      return bookReplacementTx(tx, { room, userId: ctx.user.id, items, clientRequestId, note, now });
    });

  try {
    return await run();
  } catch (e) {
    if (!isUnique(e)) throw e;
    // Lost a race on the unique request id: the winner's record is the answer.
    const replay = await prisma.$transaction((tx) => findReplay(tx, ctx, room.id, clientRequestId));
    if (replay) return replay;
    throw e;
  }
}

// ---------------------------------------------------------------- Sarfiyat Yok

/**
 * Compatibility for callers that send quantities without a setupId (the pre-redesign room check page):
 * the first setup of the room's check list that holds the product ("" when none does -> VALIDATION later).
 */
export async function firstSetupOf(ctx: Ctx, roomId: string, productIds: string[]): Promise<Map<string, string>> {
  const room = await resolveRoom(ctx, roomId);
  const checklist = await loadRoomChecklist(prisma, room.id);
  return new Map(
    productIds.map((p) => [p, checklist.setups.find((s) => s.items.some((i) => i.productId === p))?.setupId ?? ""]),
  );
}

const noConsumptionSchema = z.strictObject({ roomId: id, clientRequestId: z.uuid() });

/** "Sarfiyat Yok": the minibar is complete. One atomic record; a second one the same day is a CONFLICT. */
export async function recordNoConsumption(
  ctx: Ctx,
  input: unknown,
  now: Date = new Date(),
): Promise<{ transactionId: string; taskCompleted: boolean; replayed: boolean }> {
  const parsed = noConsumptionSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { roomId, clientRequestId } = parsed.data;
  const room = await resolveRoom(ctx, roomId);
  await assertCan(ctx, SCREEN, "O", room.hotelId);
  const day = businessDate(now);

  const replayOnly = async (tx: Tx) => {
    const r = await findReplay(tx, ctx, room.id, clientRequestId);
    return r ? { transactionId: r.transactionId, taskCompleted: r.taskCompleted, replayed: true } : null;
  };

  try {
    return await prisma.$transaction(async (tx) => {
      await lockRow(tx, "rooms", room.id);
      const replay = await replayOnly(tx);
      if (replay) return replay;
      await assertRoomVerified({ userId: ctx.user.id, roomId: room.id, hotelId: room.hotelId }, now, tx);

      const last = await tx.minibarTransaction.findFirst({
        where: { roomId: room.id, occurredAt: dayRange(day) },
        orderBy: { occurredAt: "desc" },
        select: { type: true },
      });
      if (last?.type === "SARFIYAT_YOK") {
        throw new DomainError("CONFLICT", 'Bu oda bugün zaten "Sarfiyat Yok" olarak kaydedildi');
      }

      const created = await tx.minibarTransaction.create({
        data: {
          hotelId: room.hotelId,
          roomId: room.id,
          userId: ctx.user.id,
          type: "SARFIYAT_YOK",
          note: "Sarfiyat yok, minibar tam.",
          clientRequestId,
          occurredAt: now,
        },
        select: { id: true },
      });
      await finishRoomCheck(tx, {
        roomId: room.id,
        userId: ctx.user.id,
        day,
        type: "SARFIYAT_YOK",
        transactionId: created.id,
        now,
      });
      await autoCompleteDnd(
        tx,
        { hotelId: room.hotelId, roomId: room.id, day, userId: ctx.user.id, reason: "SARFIYAT_YOK" },
        now,
      );
      const moved = await completeOpenItemsForRoom(tx, {
        hotelId: room.hotelId,
        roomId: room.id,
        day,
        userId: ctx.user.id,
        reason: "SARFIYAT_YOK",
        now,
      });

      await notify(
        {
          recipients: { hotelId: room.hotelId, roleCodes: DEPOT_ROLES },
          type: "minibar.noUse",
          title: `Sarfiyat yok — Oda ${room.number}`,
          body: `${ctx.user.fullName} kaydetti`,
          refType: "MinibarTransaction",
          refId: created.id,
        },
        tx,
      );
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: room.hotelId,
        action: "MINIBAR_NO_USE",
        entity: "MinibarTransaction",
        entityId: created.id,
        after: { roomId: room.id, roomNumber: room.number, clientRequestId },
      });
      await announceDone(tx, {
        room,
        userId: ctx.user.id,
        checkType: "SARFIYAT_YOK",
        addedQty: 0,
        taskItemId: moved.itemIds[0],
      });

      return { transactionId: created.id, taskCompleted: moved.itemIds.length > 0, replayed: false };
    });
  } catch (e) {
    if (!isUnique(e)) throw e;
    const replay = await prisma.$transaction((tx) => replayOnly(tx));
    if (replay) return replay;
    throw e;
  }
}

// ---------------------------------------------------------------- delete / update

type Actor = {
  userId: string;
  hotelId: string;
  /** Holds MB-TUK 'A' (or applies an approved correction): may touch other users' records. */
  canApprove: boolean;
  /** Approved correction of a past-dated record. */
  isManagerBypass?: boolean;
};

const NOT_FOUND_TX = "İşlem bulunamadı";

/** Locks room then transaction (same order as the check writers) and re-reads the record under the lock. */
async function loadOwnTx(tx: Tx, transactionId: string, actor: Actor, now: Date, pastMessage: string) {
  const pre = await tx.minibarTransaction.findFirst({
    where: { id: transactionId, hotelId: actor.hotelId },
    select: { roomId: true },
  });
  if (!pre) throw new DomainError("NOT_FOUND", NOT_FOUND_TX);
  await lockRow(tx, "rooms", pre.roomId);
  await lockRow(tx, "minibar_transactions", transactionId);
  const row = await tx.minibarTransaction.findFirst({
    where: { id: transactionId, hotelId: actor.hotelId },
    include: { items: true, room: { select: { id: true, number: true, floorId: true } } },
  });
  if (!row || (row.userId !== actor.userId && !actor.canApprove)) {
    throw new DomainError("NOT_FOUND", NOT_FOUND_TX);
  }
  const isToday = businessDate(row.occurredAt) === businessDate(now);
  if (!isToday && !actor.isManagerBypass) throw new DomainError("FORBIDDEN", pastMessage);
  return { row, isToday };
}

/** Delete inside an open transaction (also used by the approved-correction flow). */
export async function deleteTransactionTx(
  tx: Tx,
  actor: Actor,
  transactionId: string,
  now: Date = new Date(),
): Promise<{ restored: { productId: string; qty: number }[]; message: string }> {
  const { row, isToday } = await loadOwnTx(tx, transactionId, actor, now, "Sadece bugün yapılan işlemler silinebilir");
  if (row.type === "MYBAR_KARSILAMA") {
    throw new DomainError(
      "VALIDATION",
      "MyBar karşılama kaydı buradan silinemez; MyBar talebi üzerinden düzeltin",
    );
  }

  const byProduct = new Map<string, number>();
  for (const i of row.items) if (i.added > 0) byProduct.set(i.productId, (byProduct.get(i.productId) ?? 0) + i.added);
  const restored = [...byProduct]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([productId, qty]) => ({ productId, qty }));

  // One combined, product-ordered lock on every pool row involved, before any write.
  await lockStocks(
    tx,
    actor.hotelId,
    restored.map((r) => r.productId),
  );
  for (const r of restored) {
    await restoreStock(tx, {
      hotelId: actor.hotelId,
      userId: actor.userId,
      productId: r.productId,
      qty: r.qty,
      refType: "MinibarTransaction",
      refId: row.id,
      note: `Oda ${row.room.number} kontrol kaydı silindi, havuza iade.`,
    });
  }

  await tx.roomCheck.deleteMany({ where: { transactionId: row.id } });
  await tx.minibarTransactionItem.deleteMany({ where: { transactionId: row.id } });
  await tx.minibarTransaction.delete({ where: { id: row.id } });

  if (isToday) {
    await reopenIfUncovered(tx, {
      hotelId: actor.hotelId,
      roomId: row.room.id,
      day: businessDate(now),
      userId: actor.userId,
    });
  }

  await audit(tx, {
    userId: actor.userId,
    hotelId: actor.hotelId,
    action: "MINIBAR_ROOM_CHECK_DELETE",
    entity: "MinibarTransaction",
    entityId: row.id,
    before: {
      id: row.id,
      roomId: row.room.id,
      roomNumber: row.room.number,
      type: row.type,
      authorId: row.userId,
      occurredAt: row.occurredAt.toISOString(),
      items: row.items.map((i) => ({
        productId: i.productId,
        setupId: i.setupId,
        added: i.added,
        consumed: i.consumed,
      })),
      note: row.note,
      isManagerBypass: actor.isManagerBypass ?? false,
    },
    after: null,
  });
  await publishRadar(
    "room.check.changed",
    { hotelId: actor.hotelId, roomId: row.room.id },
    { roomId: row.room.id, transactionId: row.id, op: "SIL", byUserId: actor.userId },
    tx,
  );

  const qty = restored.reduce((a, r) => a + r.qty, 0);
  return { restored, message: `Oda ${row.room.number} kaydı silindi; ${qty} adet ürün havuza iade edildi.` };
}

/** Scope + screen check shared by delete and update: the transaction must belong to a hotel of the scope. */
async function authoriseTx(ctx: Ctx, transactionId: string) {
  const known = await prisma.minibarTransaction.findFirst({
    where: { id: transactionId, hotelId: { in: ctx.hotelIds } },
    select: { hotelId: true },
  });
  if (!known) throw new DomainError("NOT_FOUND", NOT_FOUND_TX);
  await assertCan(ctx, SCREEN, "D", known.hotelId);
  const canApprove = await can(ctx, SCREEN, "A", known.hotelId);
  return { hotelId: known.hotelId, canApprove };
}

/** Deletes the user's own record of today (or any record for an `A` holder); restores the pool, reopens task items. */
export async function deleteMyTransaction(ctx: Ctx, transactionId: string, now: Date = new Date()) {
  const { hotelId, canApprove } = await authoriseTx(ctx, transactionId);
  return prisma.$transaction((tx) =>
    deleteTransactionTx(tx, { userId: ctx.user.id, hotelId, canApprove }, transactionId, now),
  );
}

const updateSchema = z
  .strictObject({
    transactionId: id,
    updatedItems: z.array(z.strictObject({ productId: id, qty: z.number().int().min(0).max(999) })).max(50),
    note: z.string().trim().max(300).optional(),
  })
  .superRefine((v, c) => {
    const seen = new Set<string>();
    for (const [i, it] of v.updatedItems.entries()) {
      if (seen.has(it.productId)) {
        c.addIssue({
          code: "custom",
          path: ["updatedItems", i, "productId"],
          message: "Aynı ürün birden fazla satırda olamaz",
        });
      }
      seen.add(it.productId);
    }
  });

type UpdateInput = { transactionId: string; updatedItems: { productId: string; qty: number }[]; note?: string };

/** Update inside an open transaction: same capacity rule, restore + take under ONE product-ordered pool lock. */
export async function updateTransactionTx(tx: Tx, actor: Actor, input: UpdateInput, now: Date = new Date()) {
  const { row } = await loadOwnTx(
    tx,
    input.transactionId,
    actor,
    now,
    "Sadece bugün yapılan işlemler değiştirilebilir",
  );
  if (row.type !== "SETUP_KONTROL" && row.type !== "SARFIYAT_YOK") {
    throw new DomainError("VALIDATION", "Bu işlem türü değiştirilemez");
  }
  const checklist = await loadRoomChecklist(tx, row.room.id);
  const caps = capacityByProduct(checklist);
  const others = await addedToday(tx, row.room.id, businessDate(row.occurredAt), row.id);

  const old = new Map(row.items.map((i) => [i.productId, i]));
  for (const u of input.updatedItems) {
    if (u.qty === 0) continue;
    const capacity = caps.get(u.productId);
    if (capacity === undefined) {
      throw new DomainError("VALIDATION", "Ürün bu setup'ta bulunamadı", { fieldErrors: { productId: [u.productId] } });
    }
    const added = others.get(u.productId) ?? 0;
    if (added + u.qty > capacity) {
      throw new DomainError(
        "DAILY_LIMIT",
        `Setup miktarı aşılamaz: setup ${capacity}, bugün eklenen ${added}, kalan ${Math.max(0, capacity - added)}`,
      );
    }
  }

  const back: { productId: string; qty: number }[] = [];
  const take: { productId: string; qty: number }[] = [];
  for (const u of input.updatedItems) {
    const delta = u.qty - (old.get(u.productId)?.added ?? 0);
    if (delta > 0) take.push({ productId: u.productId, qty: delta });
    else if (delta < 0) back.push({ productId: u.productId, qty: -delta });
  }
  back.sort((a, b) => (a.productId < b.productId ? -1 : 1));

  await lockStocks(
    tx,
    actor.hotelId,
    [...back, ...take].map((l) => l.productId),
  );
  for (const b of back) {
    await restoreStock(tx, {
      hotelId: actor.hotelId,
      userId: actor.userId,
      productId: b.productId,
      qty: b.qty,
      refType: "MinibarTransaction",
      refId: row.id,
      note: `Oda ${row.room.number} kaydı güncellendi (azaltıldı).`,
    });
  }
  await takeManyFromPool(
    tx,
    {
      hotelId: actor.hotelId,
      userId: actor.userId,
      type: "KULLANIM",
      refType: "MinibarTransaction",
      refId: row.id,
      note: `Oda ${row.room.number} kaydı güncellendi (ek ürün).`,
    },
    take,
    now,
  );

  const prices = await tx.product.findMany({
    where: { id: { in: input.updatedItems.map((i) => i.productId) } },
    select: { id: true, purchasePrice: true, salePrice: true },
  });
  const priceOf = new Map(prices.map((p) => [p.id, p]));
  for (const u of input.updatedItems) {
    const before = old.get(u.productId);
    if (before) {
      if (u.qty > 0) {
        await tx.minibarTransactionItem.update({
          where: { id: before.id },
          data: {
            added: u.qty,
            consumed: u.qty,
            startStock: Math.max(0, before.setupQty - u.qty),
            endStock: before.setupQty,
          },
        });
      } else {
        await tx.minibarTransactionItem.delete({ where: { id: before.id } });
      }
    } else if (u.qty > 0) {
      const setup = checklist.setups.find((s) => s.items.some((i) => i.productId === u.productId))!;
      const setupQty = setup.items.find((i) => i.productId === u.productId)!.setupQty;
      await tx.minibarTransactionItem.create({
        data: {
          transactionId: row.id,
          productId: u.productId,
          setupId: setup.setupId,
          setupQty,
          startStock: Math.max(0, setupQty - u.qty),
          endStock: setupQty,
          consumed: u.qty,
          added: u.qty,
          purchasePrice: priceOf.get(u.productId)?.purchasePrice ?? null,
          salePrice: priceOf.get(u.productId)?.salePrice ?? null,
        },
      });
    }
  }

  const finalQty = new Map(row.items.map((i) => [i.productId, i.added]));
  for (const u of input.updatedItems) finalQty.set(u.productId, u.qty);
  const total = [...finalQty.values()].reduce((a, b) => a + b, 0);
  const type = total > 0 ? "SETUP_KONTROL" : "SARFIYAT_YOK";
  await tx.minibarTransaction.update({
    where: { id: row.id },
    data: { type, note: input.note !== undefined ? input.note : row.note },
  });
  await tx.roomCheck.updateMany({
    where: { transactionId: row.id },
    data: { type: type === "SETUP_KONTROL" ? "URUN_EKLENDI" : "SARFIYAT_YOK" },
  });

  await audit(tx, {
    userId: actor.userId,
    hotelId: actor.hotelId,
    action: "MINIBAR_ROOM_CHECK_UPDATE",
    entity: "MinibarTransaction",
    entityId: row.id,
    before: {
      roomId: row.room.id,
      roomNumber: row.room.number,
      type: row.type,
      authorId: row.userId,
      items: row.items.map((i) => ({ productId: i.productId, added: i.added })),
      note: row.note,
    },
    after: {
      type,
      updatedItems: input.updatedItems,
      note: input.note ?? row.note,
      isManagerBypass: actor.isManagerBypass ?? false,
    },
  });
  await publishRadar(
    "room.check.changed",
    { hotelId: actor.hotelId, roomId: row.room.id },
    { roomId: row.room.id, transactionId: row.id, op: "DUZELT", byUserId: actor.userId },
    tx,
  );
  return { message: `Oda ${row.room.number} kaydı güncellendi.` };
}

/** Changes the per-product quantities of the user's own record of today (stock difference moves through the pool). */
export async function updateMyTransaction(ctx: Ctx, input: unknown, now: Date = new Date()) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { hotelId, canApprove } = await authoriseTx(ctx, parsed.data.transactionId);
  return prisma.$transaction((tx) =>
    updateTransactionTx(tx, { userId: ctx.user.id, hotelId, canApprove }, parsed.data, now),
  );
}

// ---------------------------------------------------------------- islemlerim

const listSchema = z
  .strictObject({
    hotelId: id.optional(),
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı")
      .optional(),
    limit: z.number().int().min(1).max(300).optional(),
  })
  .optional();

export type MyTransaction = RoomCheckHistoryItem & { kind: "ISLEM" | "DND"; canDelete: boolean };

/** The user's own records (replacements, Sarfiyat Yok, MyBar fulfilment) and DND marks, newest first. */
export async function listMyTransactions(
  ctx: Ctx,
  q: z.input<typeof listSchema> = {},
  now: Date = new Date(),
): Promise<MyTransaction[]> {
  const parsed = listSchema.safeParse(q);
  if (!parsed.success) throw fromZod(parsed.error);
  const hotelId = parsed.data?.hotelId ?? ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", hotelId);
  const limit = parsed.data?.limit ?? 150;
  const today = businessDate(now);
  const range = parsed.data?.day ? dayRange(parsed.data.day) : undefined;

  const roomInclude = {
    floor: { select: { id: true, number: true, name: true } },
    roomType: { select: { name: true } },
  } as const;
  const [txs, dndChecks, stocks] = await Promise.all([
    prisma.minibarTransaction.findMany({
      where: { hotelId, userId: ctx.user.id, ...(range ? { occurredAt: range } : {}) },
      include: {
        room: { include: roomInclude },
        items: { include: { product: { include: { group: { select: { name: true } } } } } },
        correctionRequests: {
          include: { requestedBy: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
    }),
    prisma.roomDndCheck.findMany({
      // the automatic completion check ("OTOMATİK TAMAMLANDI ...", written when a replacement / Sarfiyat Yok
      // closes a DND) is the other record's side effect, not a DND mark of the user
      where: {
        userId: ctx.user.id,
        dnd: { hotelId },
        OR: [{ note: null }, { NOT: { note: { startsWith: "OTOMATİK TAMAMLANDI" } } }],
        ...(range ? { at: range } : {}),
      },
      include: { dnd: { include: { room: { include: roomInclude } } } },
      orderBy: { at: "desc" },
      take: limit,
    }),
    prisma.hotelStock.findMany({ where: { hotelId }, select: { productId: true, remainingQty: true } }),
  ]);
  const stockMap = new Map(stocks.map((s) => [s.productId, s.remainingQty]));

  const rows: MyTransaction[] = txs.map((t) => {
    const dateStr = businessDate(t.occurredAt);
    const isToday = dateStr === today;
    let typeLabel = "Sarfiyat Yok";
    let typeBadgeColor: RoomCheckHistoryItem["typeBadgeColor"] = "slate";
    if (t.type === "SETUP_KONTROL") {
      typeLabel = "Ürün İkamesi";
      typeBadgeColor = "emerald";
    } else if (t.type === "MYBAR_KARSILAMA") {
      typeLabel = "MyBar Karşılama";
      typeBadgeColor = "amber";
    }
    const items = t.items.map((i) => ({
      productId: i.productId,
      productName: i.product.name,
      consumed: i.consumed,
      added: i.added,
      groupName: i.product.group?.name ?? "Genel",
      stockQty: stockMap.get(i.productId) ?? 0,
      maxTargetQty: i.setupQty || 10,
    }));
    const latest = t.correctionRequests[0];
    return {
      id: t.id,
      kind: "ISLEM",
      roomId: t.roomId,
      roomNumber: t.room.number,
      floorId: t.room.floor.id,
      floorNumber: t.room.floor.number,
      floorName: t.room.floor.name,
      roomTypeName: t.room.roomType?.name ?? "Standart Oda",
      type: t.type,
      typeLabel,
      typeBadgeColor,
      note: t.note,
      occurredAt: t.occurredAt.toISOString(),
      dateStr,
      isToday,
      canEditDirectly: isToday,
      canDelete: isToday,
      items,
      totalItemsCount: items.reduce((a, x) => a + x.added, 0),
      pendingCorrection:
        latest && latest.status === "BEKLIYOR"
          ? {
              id: latest.id,
              actionType: latest.actionType,
              reason: latest.reason,
              status: latest.status,
              requestedByName: latest.requestedBy.fullName,
              createdAt: latest.createdAt.toISOString(),
            }
          : null,
    };
  });

  for (const c of dndChecks) {
    const room = c.dnd.room;
    const dateStr = businessDate(c.at);
    rows.push({
      id: `dnd:${c.id}`,
      kind: "DND",
      roomId: room.id,
      roomNumber: room.number,
      floorId: room.floor.id,
      floorNumber: room.floor.number,
      floorName: room.floor.name,
      roomTypeName: room.roomType?.name ?? "Standart Oda",
      type: "DND",
      typeLabel: `DND (${c.no}. kontrol)`,
      typeBadgeColor: "yellow",
      note: c.note,
      occurredAt: c.at.toISOString(),
      dateStr,
      isToday: dateStr === today,
      canEditDirectly: false,
      canDelete: false,
      items: [],
      totalItemsCount: 0,
      pendingCorrection: null,
    });
  }
  rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------- correction requests (past-dated records)

const requestSchema = z.strictObject({
  transactionId: id,
  actionType: z.enum(["SILME", "DUZELTME"]),
  reason: z.string().trim().min(5, "Lütfen geçmiş tarihli işlem için en az 5 karakterlik gerekçe giriniz").max(500),
  proposedData: z.record(id, z.number().int().min(0).max(999)).optional(),
});

/** A warehouse officer (MB-TAL D) asks the system administrator to delete/correct a past-dated record. */
export async function createCorrectionRequest(ctx: Ctx, input: unknown) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { transactionId, actionType, reason, proposedData } = parsed.data;
  const known = await prisma.minibarTransaction.findFirst({
    where: { id: transactionId, hotelId: { in: ctx.hotelIds } },
    select: { hotelId: true },
  });
  if (!known) throw new DomainError("NOT_FOUND", "Düzeltme talep edilecek işlem kaydı bulunamadı");
  const hotelId = known.hotelId;
  await assertCan(ctx, "MB-TAL", "D", hotelId);

  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "minibar_transactions", transactionId);
    const row = await tx.minibarTransaction.findFirst({ where: { id: transactionId, hotelId }, include: { room: true } });
    if (!row) throw new DomainError("NOT_FOUND", "Düzeltme talep edilecek işlem kaydı bulunamadı");
    const pending = await tx.minibarCorrectionRequest.findFirst({ where: { transactionId, status: "BEKLIYOR" } });
    if (pending) {
      throw new DomainError("CONFLICT", "Bu işlem için zaten onay bekleyen bir düzeltme talebi bulunmaktadır");
    }
    if (actionType === "DUZELTME") {
      // Same rules the approval will apply (updateTransactionTx): only room-check records, only setup products.
      if (row.type !== "SETUP_KONTROL" && row.type !== "SARFIYAT_YOK") {
        throw new DomainError("VALIDATION", "Bu işlem türü için düzeltme talebi oluşturulamaz");
      }
      if (!proposedData || Object.keys(proposedData).length === 0) {
        throw new DomainError("VALIDATION", "Düzeltme talebinde önerilen miktarlar girilmelidir", {
          fieldErrors: { proposedData: ["Önerilen miktarlar girilmelidir"] },
        });
      }
      const caps = capacityByProduct(await loadRoomChecklist(tx, row.roomId));
      const unknown = Object.keys(proposedData).filter((productId) => !caps.has(productId));
      if (unknown.length > 0) {
        throw new DomainError("VALIDATION", "Ürün bu setup'ta bulunamadı", { fieldErrors: { productId: unknown } });
      }
    }

    const req = await tx.minibarCorrectionRequest.create({
      data: {
        hotelId,
        transactionId,
        requestedById: ctx.user.id,
        actionType,
        reason,
        proposedData: actionType === "DUZELTME" ? proposedData : undefined,
        status: "BEKLIYOR",
      },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "MINIBAR_CORRECTION_REQUEST_CREATE",
      entity: "MinibarCorrectionRequest",
      entityId: req.id,
      before: null,
      after: { id: req.id, transactionId, roomNumber: row.room.number, actionType, reason, proposedData, status: "BEKLIYOR" },
    });
    return {
      success: true,
      requestId: req.id,
      message: `Oda ${row.room.number} için geçmiş tarihli ${
        actionType === "SILME" ? "silme" : "düzeltme"
      } talebi Sistem Yöneticisi onayına gönderildi.`,
    };
  });
}

/** Correction requests of a hotel (the route has already authorised `MB-TAL V` for it). */
export async function listCorrectionRequests(params: {
  hotelId: string;
  status?: "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI";
}): Promise<CorrectionRequestItem[]> {
  const { hotelId, status } = params;
  const requests = await prisma.minibarCorrectionRequest.findMany({
    where: { hotelId, ...(status ? { status } : {}) },
    include: {
      requestedBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      transaction: {
        include: {
          room: { include: { floor: { select: { name: true } } } },
          items: { include: { product: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((r) => ({
    id: r.id,
    transactionId: r.transactionId,
    roomNumber: r.transaction?.room?.number || "Bilinmiyor",
    floorName: r.transaction?.room?.floor?.name || "-",
    occurredAt: r.transaction?.occurredAt?.toISOString() || r.createdAt.toISOString(),
    actionType: r.actionType,
    reason: r.reason,
    status: r.status,
    requestedById: r.requestedById,
    requestedByName: r.requestedBy.fullName,
    approvedById: r.approvedById,
    approvedByName: r.approvedBy?.fullName || null,
    proposedData: r.proposedData ? (r.proposedData as Record<string, number>) : null,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() || null,
    items: (r.transaction?.items || []).map((i) => ({ productName: i.product.name, qty: i.added })),
  }));
}

const decisionSchema = z.strictObject({
  requestId: id,
  approved: z.boolean(),
  rejectReason: z.string().trim().max(500).optional(),
});

/**
 * The system administrator (`MB-TUK A` and role kind SISTEM) approves or rejects a correction request.
 * Approval applies the delete/update in the same transaction; nobody decides their own request.
 */
export async function resolveCorrectionRequest(ctx: Ctx, input: unknown, now: Date = new Date()) {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { requestId, approved, rejectReason } = parsed.data;
  const known = await prisma.minibarCorrectionRequest.findFirst({
    where: { id: requestId, hotelId: { in: ctx.hotelIds } },
    select: { hotelId: true },
  });
  if (!known) throw new DomainError("NOT_FOUND", "Düzeltme talebi bulunamadı");
  const hotelId = known.hotelId;
  await assertCan(ctx, SCREEN, "A", hotelId);
  if (ctx.user.roleKind !== "SISTEM") {
    throw new DomainError("FORBIDDEN", "Düzeltme taleplerini yalnızca Sistem Yöneticisi karara bağlayabilir");
  }
  const approverId = ctx.user.id;

  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "minibar_correction_requests", requestId);
    const req = await tx.minibarCorrectionRequest.findFirst({
      where: { id: requestId, hotelId },
      include: { transaction: { include: { room: true } } },
    });
    if (!req) throw new DomainError("NOT_FOUND", "Düzeltme talebi bulunamadı");
    if (req.status !== "BEKLIYOR") {
      throw new DomainError("CONFLICT", `Bu talep zaten önceden ${req.status.toLowerCase()} yapılmıştır`);
    }
    if (req.requestedById === approverId) {
      throw new DomainError("FORBIDDEN", "Kendi oluşturduğunuz talebi karara bağlayamazsınız");
    }

    const roomNumber = req.transaction?.room?.number || "";
    if (approved) {
      await tx.minibarCorrectionRequest.update({
        where: { id: req.id },
        data: { status: "ONAYLANDI", approvedById: approverId, resolvedAt: now },
      });
      const actor: Actor = { userId: approverId, hotelId, canApprove: true, isManagerBypass: true };
      if (req.actionType === "SILME" && req.transactionId) {
        await deleteTransactionTx(tx, actor, req.transactionId, now);
      } else if (req.actionType === "DUZELTME" && req.transactionId && req.proposedData) {
        const updatedItems = Object.entries(req.proposedData as Record<string, number>).map(([productId, qty]) => ({
          productId,
          qty: Number(qty),
        }));
        await updateTransactionTx(tx, actor, { transactionId: req.transactionId, updatedItems }, now);
      }
      await audit(tx, {
        userId: approverId,
        hotelId,
        action: "MINIBAR_CORRECTION_APPROVE",
        entity: "MinibarCorrectionRequest",
        entityId: req.id,
        before: { status: "BEKLIYOR" },
        after: { status: "ONAYLANDI", actionType: req.actionType, roomNumber, resolvedAt: now.toISOString() },
      });
      await notify(
        {
          recipients: [req.requestedById],
          type: "minibar.correction.resolved",
          title: `Düzeltme talebi onaylandı · Oda ${roomNumber}`,
          body: req.actionType === "SILME" ? "Kayıt silindi." : "Kayıt önerdiğiniz miktarlarla düzeltildi.",
          refType: "MinibarCorrectionRequest",
          refId: req.id,
        },
        tx,
      );
      return { success: true, message: `Oda ${roomNumber} için talep onaylandı ve uygulandı.` };
    }

    const reason = rejectReason || "Yönetici tarafından onaylanmadı.";
    await tx.minibarCorrectionRequest.update({
      where: { id: req.id },
      data: { status: "REDDEDILDI", approvedById: approverId, rejectReason: reason, resolvedAt: now },
    });
    await audit(tx, {
      userId: approverId,
      hotelId,
      action: "MINIBAR_CORRECTION_REJECT",
      entity: "MinibarCorrectionRequest",
      entityId: req.id,
      before: { status: "BEKLIYOR" },
      after: { status: "REDDEDILDI", rejectReason: reason, roomNumber, resolvedAt: now.toISOString() },
    });
    await notify(
      {
        recipients: [req.requestedById],
        type: "minibar.correction.resolved",
        title: `Düzeltme talebi reddedildi · Oda ${roomNumber}`,
        body: reason.slice(0, 300),
        refType: "MinibarCorrectionRequest",
        refId: req.id,
      },
      tx,
    );
    return { success: true, message: `Oda ${roomNumber} için talep reddedildi.` };
  });
}
