"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction } from "@/lib/result";
import { stats } from "../roomService/stats";

const input = z.object({ hotelId: z.string().min(1), from: z.string(), to: z.string() });

/** SLA statistics of one hotel's business-day range (RO-SLA view). */
export async function getSlaStatsAction(hotelId: string, range: { from: string; to: string }) {
  return safeAction(input, async (v) => stats.sla(await requireUser(), v.hotelId, { from: v.from, to: v.to }))({
    hotelId,
    ...range,
  });
}

/** The 20 slowest delivered orders of the range. */
export async function getSlowestOrdersAction(hotelId: string, range: { from: string; to: string }) {
  return safeAction(input, async (v) =>
    stats.slowest(await requireUser(), v.hotelId, { from: v.from, to: v.to }, 20),
  )({ hotelId, ...range });
}
