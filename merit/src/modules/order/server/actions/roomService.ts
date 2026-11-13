"use server";

import { z } from "zod";
import { safeAction } from "@/lib/result";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { prisma } from "@/lib/prisma";
import { orders } from "../orders";

const idSchema = z.object({
  orderId: z.string().min(1),
});

const cancelSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(3, "Sebep en az 3 karakter olmalı").max(200, "Sebep çok uzun"),
});

async function requireRoomOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { kind: true },
  });
  if (!order || order.kind !== "ODA_SERVISI") {
    throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
  }
}

export async function approveRoomOrderAction(raw: unknown) {
  return safeAction(idSchema, async (input) => {
    const ctx = await requireUser();
    await requireRoomOrder(input.orderId);
    return orders.transition(ctx, input.orderId, "ONAYLANDI");
  })(raw);
}

export async function cancelRoomOrderAction(raw: unknown) {
  return safeAction(cancelSchema, async (input) => {
    const ctx = await requireUser();
    await requireRoomOrder(input.orderId);
    return orders.transition(ctx, input.orderId, "IPTAL", { reason: input.reason });
  })(raw);
}

export async function startRoomPrepAction(raw: unknown) {
  return safeAction(idSchema, async (input) => {
    const ctx = await requireUser();
    await requireRoomOrder(input.orderId);
    await orders.startPrep(ctx, input.orderId);
    return { ok: true as const };
  })(raw);
}

export async function markRoomReadyAction(raw: unknown) {
  return safeAction(idSchema, async (input) => {
    const ctx = await requireUser();
    await requireRoomOrder(input.orderId);
    return orders.transition(ctx, input.orderId, "HAZIR");
  })(raw);
}

export async function markRoomOnWayAction(raw: unknown) {
  return safeAction(idSchema, async (input) => {
    const ctx = await requireUser();
    await requireRoomOrder(input.orderId);
    return orders.transition(ctx, input.orderId, "YOLDA");
  })(raw);
}

export async function markRoomDeliveredAction(raw: unknown) {
  return safeAction(idSchema, async (input) => {
    const ctx = await requireUser();
    await requireRoomOrder(input.orderId);
    return orders.transition(ctx, input.orderId, "TESLIM_EDILDI");
  })(raw);
}
