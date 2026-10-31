import { randomUUID } from "node:crypto";
import type { User } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { generateQrToken } from "@/lib/qr";
import { testDb } from "./db";
import { ctxFor, hotelId, makeUser, roleByCode } from "./fixtures";

/** An ordering outlet with one table (valid QR token) and a few menu items. */
export async function orderSetup(over: { outlet?: Record<string, unknown> } = {}) {
  const outlet = await testDb.outlet.create({
    data: {
      hotelId: await hotelId("MR"),
      name: "Havuz Bar",
      type: "BAR",
      hasMenu: true,
      hasOrdering: true,
      orderingEnabled: true,
      ...over.outlet,
    },
  });
  const created = await testDb.outletTable.create({ data: { outletId: outlet.id, label: "M1" } });
  const token = generateQrToken("TABLE", created.id);
  const table = await testDb.outletTable.update({ where: { id: created.id }, data: { qrToken: token } });
  const node = (name: string, price: string | null, extra: Record<string, unknown> = {}) =>
    testDb.menuNode.create({
      data: { outletId: outlet.id, kind: "OGE", name, price: price ?? undefined, ...extra },
    });
  const mojito = await node("Mojito", "9.50");
  const cola = await node("Kola", "3.00");
  return { outlet, table, token, mojito, cola, node, hotelId: outlet.hotelId };
}

export type OrderSetup = Awaited<ReturnType<typeof orderSetup>>;

/** A staff context bound to an outlet session (outlet roles need `session.outletId`). */
export async function staffCtx(
  username: string,
  roleCode: string,
  outletId?: string,
): Promise<{ user: User; ctx: Ctx }> {
  const user = await makeUser({ username, roleCode, hotelCode: "MR" });
  const ctx = await ctxFor(user, { hotelCode: "MR" });
  if (outletId) ctx.session.outletId = outletId;
  return { user, ctx };
}

export async function openSession(
  userId: string,
  outletId: string,
  roleCode: string,
  status: "ONLINE" | "UYARI" | "CIKTI" = "ONLINE",
) {
  const role = await roleByCode(roleCode);
  return testDb.userSession.create({
    data: {
      userId,
      hotelId: await hotelId("MR"),
      outletId,
      roleId: role.id,
      status,
      expiresAt: new Date(Date.now() + 3_600_000),
      ip: "127.0.0.1",
      userAgent: "vitest",
    },
  });
}

/** Inserts an order straight into the DB (state machine tests). */
export async function seedOrder(s: OrderSetup, over: Record<string, unknown> = {}) {
  const orderNo = (await testDb.order.count()) + 1;
  return testDb.order.create({
    data: {
      hotelId: s.hotelId,
      outletId: s.outlet.id,
      kind: "MASA",
      tableId: s.table.id,
      businessDate: new Date("2026-10-31T00:00:00.000Z"),
      orderNo,
      status: "GONDERILDI",
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "10.0.0.1",
      items: { create: [{ menuNodeId: s.mojito.id, nameSnapshot: "Mojito", qty: 2 }] },
      ...over,
    },
  });
}
