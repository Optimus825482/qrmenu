"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction } from "@/lib/result";
import { callQuerySchema, orderQuerySchema, outletAdmin } from "../server/outletAdmin";

/** Server actions of Sipariş ve Çağrı Yönetimi (QS-YON); every rule lives in server/outletAdmin. */
const id = z.string().min(1).max(64);
const reason = z.string().max(300);
const openStatus = z.enum(["GONDERILDI", "ONAYLANDI", "HAZIR"]);

export async function outletAdminCapabilitiesAction(hotelId: string) {
  return safeAction(id, async (input) => outletAdmin.capabilities(await requireUser(), input))(hotelId);
}

export async function listAdminOrdersAction(raw: unknown) {
  return safeAction(orderQuerySchema, async (input) => outletAdmin.listOrders(await requireUser(), input))(raw);
}

export async function advanceAdminOrderAction(orderId: string, expected: string) {
  return safeAction(z.object({ orderId: id, expected: openStatus }), async (input) =>
    outletAdmin.advanceOrder(await requireUser(), input.orderId, input.expected),
  )({ orderId, expected });
}

export async function cancelAdminOrderAction(orderId: string, why: string) {
  return safeAction(z.object({ orderId: id, why: reason }), async (input) =>
    outletAdmin.cancelOrder(await requireUser(), input.orderId, input.why),
  )({ orderId, why });
}

export async function listAdminCallsAction(raw: unknown) {
  return safeAction(callQuerySchema, async (input) => outletAdmin.listCalls(await requireUser(), input))(raw);
}

export async function resolveAdminCallAction(callId: string, status: "YANITLANDI" | "KAPANDI") {
  return safeAction(z.object({ callId: id, status: z.enum(["YANITLANDI", "KAPANDI"]) }), async (input) => {
    await outletAdmin.resolveCall(await requireUser(), input.callId, input.status);
    return null;
  })({ callId, status });
}

export async function cancelAdminCallAction(callId: string, why: string) {
  return safeAction(z.object({ callId: id, why: reason }), async (input) => {
    await outletAdmin.cancelCall(await requireUser(), input.callId, input.why);
    return null;
  })({ callId, why });
}
