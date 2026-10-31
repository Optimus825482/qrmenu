import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { assertCan, can } from "@/lib/rbac";
import { publish } from "@/lib/realtime";
import { DomainError, fromZod } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { notify } from "@/modules/core/server/notifications";
import { type GuestMeta, resolveGuestTokenLimited } from "@/modules/menu/server/guestToken";
import { onlineAt, outletAllowed } from "./approvals";

/** Waiter calls: 3 per minute per table. */
export const callLimiter = createRateLimiter({ max: 3, windowMs: 60_000 });

const inputSchema = z.object({
  token: z.string().min(1).max(64),
  type: z.enum(["GARSON", "HESAP", "DIGER"]),
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
    const open = await tx.waiterCall.findFirst({
      where: { tableId: table.id, type: data.type, status: "ACIK" },
      orderBy: { createdAt: "asc" },
    });
    if (open) {
      return { callId: open.id, type: open.type, status: open.status, tableLabel: table.label, createdAt: open.createdAt };
    }
    const call = await tx.waiterCall.create({
      data: { outletId: state.outletId, tableId: table.id, type: data.type, note: data.note || null },
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
        title: `${TYPE_TEXT[data.type]} · ${state.outletName} ${table.label}`,
        body: call.note ?? TYPE_TEXT[data.type],
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
    await publish(
      {
        type: "call.resolved",
        hotelId: call.outlet.hotelId,
        outletId: call.outletId,
        payload: { callId, tableId: call.tableId, tableLabel: call.table.label, status },
      },
      tx,
    );
  });
}

async function listOpen(ctx: Ctx, outletId: string): Promise<OpenCall[]> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  await authorize(ctx, outlet.hotelId, outletId);
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

export const waiterCalls = { createFromGuest, resolve, listOpen };
