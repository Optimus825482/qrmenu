"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction } from "@/lib/result";
import { staffOrders } from "../server/staffOrders";

const id = z.string().min(1);

export async function staffOrderMenuAction(outletId: string) {
  return safeAction(id, async (value) => staffOrders.menu(await requireUser(), value))(outletId);
}

export async function createStaffOrderAction(value: unknown) {
  return safeAction(z.unknown(), async (input) => staffOrders.create(await requireUser(), input))(value);
}
