import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { assertCan, can } from "@/lib/rbac";
import { publish } from "@/lib/realtime";
import { DomainError, fromZod } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { resolveActive } from "@/modules/menu/server/callOptions";
import { type GuestMeta, resolveGuestTokenLimited } from "@/modules/menu/server/guestToken";
import { onlineAt, outletAllowed } from "./approvals";

/** Waiter calls: 3 per minute per table. */
export const callLimiter = createRateLimiter({ max: 3, windowMs: 60_000 });

const inputSchema = z
  .object({
    token: z.string().min(1).max(64),
    type: z.enum(["GARSON", "HESAP", "DIGER"]).optional(),
    optionId: z.string().min(1).max(64).optional(),
    note: z
      .string()
      .transform((s) =>
        s
          .replace(/<[^>]*>/g, "")
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .trim(),
      )
      .pipe(z.string().max(200, "En fazla 200 karakter"))
      .optional(),
    ip: z.string().min(1),
    userAgent: z.string().default(""),
  })
  .refine((v) => Boolean(v.type || v.optionId), {
    message: "Çağrı tipi veya seçeneği belirtilmelidir",
  });

export type GuestCallInput = z.input<typeof inputSchema>;
export type GuestCallView = { callId: string; type: string; status: string; tableLabel: string; createdAt: Date };

export type OpenCall = {
  id: string;
  tableLabel: string;
  type: string;
  note: string | null;
  createdAt: Date;
  ageSec: number;
  overdue: boolean;
};

const TYPE_TEXT = { GARSON: "Garson çağrısı", HESAP: "Hesap isteği", DIGER: "Çağrı" } as const;

async function createFromGuest(input: GuestCallInput): Promise<GuestCallView> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const data = parsed.data;
  const meta: GuestMeta = { ip: data.ip, userAgent: data.userAgent };

  const target = await resolveGuestTokenLimited(data.token, meta, undefined, undefined, { log: false });
  if (target.kind !== "TABLE") {
    if (target.kind === "NONE" && target.reason === "RATE_LIMITED") {
      throw new DomainError("RATE_LIMITED", "Çok fazla deneme, biraz sonra tekrar deneyin");
    }
    throw new DomainError("NOT_FOUND", "Masa bulunamadı");
  }
  const { table, state } = target;
  if (!callLimiter.hit(table.id).allowed) {
    throw new DomainError("RATE_LIMITED", "Çok fazla çağrı, biraz sonra tekrar deneyin");
  }

  return prisma.$transaction(async (tx) => {
    let callType: "GARSON" | "HESAP" | "DIGER";
    let callNote: string | null = null;

    if (data.optionId) {
      const resolved = await resolveActive(tx, state.outletId, data.optionId);
      callType = resolved.callType;
      callNote = resolved.label;
    } else {
      callType = data.type!;
      callNote = data.note || null;
    }

    // Serialize concurrent identical calls of one table so the check + insert below cannot both pass.
    await tx.$queryRaw`SELECT 1 WHERE pg_advisory_xact_lock(hashtext(${"call:" + table.id}), hashtext(${callType + ":" + (callNote ?? "")})) IS NULL`;
    const open = await tx.waiterCall.findFirst({
      where: { tableId: table.id, type: callType, note: callNote, status: "ACIK" },
      orderBy: { createdAt: "asc" },
    });
    if (open) {
      return { callId: open.id, type: open.type, status: open.status, tableLabel: table.label, createdAt: open.createdAt };
    }
    const call = await tx.waiterCall.create({
      data: { outletId: state.outletId, tableId: table.id, type: callType, note: callNote },
    });

    const assignment = await tx.tableAssignment.findFirst({
      where: { tableId: table.id, isActive: true, user: { isActive: true } },
      orderBy: { createdAt: "desc" },
      select: { userId: true },
    });
    const recipients = new Set<string>(await onlineAt(tx, state.outletId, ["R-KAS"]));
    if (assignment) recipients.add(assignment.userId);
    else for (const id of await onlineAt(tx, state.outletId, ["R-GAR"])) recipients.add(id);

    await notify(
      {
        recipients: [...recipients],
        type: "call.created",
        title: `${call.note ? `${call.note} · ` : ""}${TYPE_TEXT[callType]} · ${state.outletName} ${table.label}`,
        body: call.note ?? TYPE_TEXT[callType],
        refType: "WaiterCall",
        refId: call.id,
      },
      tx,
    );
    await publish(
      {
        type: "call.created",
        hotelId: state.hotelId,
        outletId: state.outletId,
        payload: {
          callId: call.id,
          tableId: table.id,
          tableLabel: table.label,
          type: call.type,
          createdAt: call.createdAt.toISOString(),
        },
      },
      tx,
    );
    return { callId: call.id, type: call.type, status: call.status, tableLabel: table.label, createdAt: call.createdAt };
  });
}

/** Staff: QM-CAG edit or QS-KAS edit; outlet roles only in their session outlet. */
async function authorize(ctx: Ctx, hotelId: string, outletId: string): Promise<void> {
  if (!ctx.hotelIds.includes(hotelId)) throw new DomainError("NOT_FOUND", "Çağrı bulunamadı");
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  if (await can(ctx, "QM-CAG", "D", hotelId)) return;
  await assertCan(ctx, "QS-KAS", "D", hotelId);
}

/** Reading the open calls: the writers above, or a cashier-screen viewer (QS-KAS V, e.g. Outlet Yöneticisi). */
async function authorizeRead(ctx: Ctx, hotelId: string, outletId: string): Promise<void> {
  if (!ctx.hotelIds.includes(hotelId)) throw new DomainError("NOT_FOUND", "Çağrı bulunamadı");
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  if (await can(ctx, "QM-CAG", "D", hotelId)) return;
  if (await can(ctx, "QS-KAS", "D", hotelId)) return;
  await assertCan(ctx, "QS-KAS", "V", hotelId);
}

async function resolve(ctx: Ctx, callId: string, status: "YANITLANDI" | "KAPANDI"): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM waiter_calls WHERE id = ${callId} FOR UPDATE`;
    if (rows.length === 0) throw new DomainError("NOT_FOUND", "Çağrı bulunamadı");
    const call = await tx.waiterCall.findUniqueOrThrow({
      where: { id: callId },
      include: { table: { select: { label: true } }, outlet: { select: { hotelId: true } } },
    });
    await authorize(ctx, call.outlet.hotelId, call.outletId);
    if (call.status !== "ACIK" && !(call.status === "YANITLANDI" && status === "KAPANDI")) {
      throw new DomainError("CONFLICT", "Çağrı zaten işlendi");
    }
    await tx.waiterCall.update({
      where: { id: callId },
      data: { status, resolvedById: ctx.user.id, resolvedAt: new Date() },
    });
    const waiterName = ctx.user.fullName || ctx.user.username;
    await publish(
      {
        type: "call.resolved",
        hotelId: call.outlet.hotelId,
        outletId: call.outletId,
        payload: { callId, tableId: call.tableId, tableLabel: call.table.label, status, waiterId: ctx.user.id, waiterName },
      },
      tx,
    );
  });
}

async function listOpen(ctx: Ctx, outletId: string): Promise<OpenCall[]> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  await authorizeRead(ctx, outlet.hotelId, outletId);
  const alertSeconds = await getSetting("order.callAlertSeconds", outlet.hotelId);
  const rows = await prisma.waiterCall.findMany({
    where: { outletId, status: "ACIK" },
    include: { table: { select: { label: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const now = Date.now();
  return rows.map((r) => {
    const ageSec = Math.max(0, Math.floor((now - r.createdAt.getTime()) / 1000));
    return {
      id: r.id,
      tableLabel: r.table.label,
      type: r.type,
      note: r.note,
      createdAt: r.createdAt,
      ageSec,
      overdue: ageSec > alertSeconds,
    };
  });
}

export const CALL_CANCEL_NOTE_MIN = 3;
export const CALL_CANCEL_NOTE_MAX = 200;

/**
 * Cancels a call that should never have been open (pressed by mistake, a prank, a table already gone): status
 * IPTAL with who, when and why, an audit record, and the same `call.resolved` event the staff screens already
 * listen to, so the call leaves the waiter, cashier and radar lists. Only from Sipariş ve Çağrı Yönetimi
 * (QS-YON approve); a waiter closes a call, they do not cancel it.
 */
async function cancel(ctx: Ctx, callId: string, reason: string): Promise<void> {
  const note = reason.trim();
  if ([...note].length < CALL_CANCEL_NOTE_MIN || [...note].length > CALL_CANCEL_NOTE_MAX) {
    const message = `Açıklama ${CALL_CANCEL_NOTE_MIN}-${CALL_CANCEL_NOTE_MAX} karakter olmalı`;
    throw new DomainError("VALIDATION", message, { fieldErrors: { reason: [message] } });
  }
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM waiter_calls WHERE id = ${callId} FOR UPDATE`;
    if (rows.length === 0) throw new DomainError("NOT_FOUND", "Çağrı bulunamadı");
    const call = await tx.waiterCall.findUniqueOrThrow({
      where: { id: callId },
      include: { table: { select: { label: true } }, outlet: { select: { hotelId: true } } },
    });
    const hotelId = call.outlet.hotelId;
    if (!ctx.hotelIds.includes(hotelId)) throw new DomainError("NOT_FOUND", "Çağrı bulunamadı");
    await assertCan(ctx, "QS-YON", "A", hotelId);
    if (call.status !== "ACIK" && call.status !== "YANITLANDI") throw new DomainError("CONFLICT", "Çağrı zaten işlendi");
    const now = new Date();
    await tx.waiterCall.update({
      where: { id: callId },
      data: { status: "IPTAL", cancelledById: ctx.user.id, cancelledAt: now, cancelNote: note },
    });
    await tx.notification.updateMany({ where: { refType: "WaiterCall", refId: callId, readAt: null }, data: { readAt: now } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "CALL_IPTAL",
      entity: "WaiterCall",
      entityId: callId,
      before: { status: call.status },
      after: { status: "IPTAL", reason: note },
    });
    await publish(
      {
        type: "call.resolved",
        hotelId,
        outletId: call.outletId,
        payload: {
          callId,
          tableId: call.tableId,
          tableLabel: call.table.label,
          status: "IPTAL",
          waiterId: ctx.user.id,
          waiterName: ctx.user.fullName || ctx.user.username,
        },
      },
      tx,
    );
  });
}

export const waiterCalls = { createFromGuest, resolve, cancel, listOpen };
