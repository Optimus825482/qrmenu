"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { type CommandCenterKpis, getCommandCenterKpis } from "./commandCenter";
import { LIVE_STATUS_SCREEN, type LiveStatus, getLiveStatus } from "./liveStatus";

const inputSchema = z.string().min(1).optional();

/** Server Action behind the desktop "Anlık Durum" widget: today's live counters. */
export async function liveStatusAction(hotelId?: string): Promise<Result<LiveStatus>> {
  return safeAction(inputSchema, async (id) => getLiveStatus(await requireUser(), id))(hotelId);
}

/**
 * The widget's online-user and occupancy lines, scoped by its own screen (CR-DUR) instead of Komuta Merkezi, so a
 * user granted only the widget sees them too. Komuta Merkezi figures the widget does not show are left out.
 */
export async function liveStatusKpisAction(hotelId?: string): Promise<Result<CommandCenterKpis>> {
  return safeAction(inputSchema, async (id) => {
    const k = await getCommandCenterKpis(await requireUser(), id, LIVE_STATUS_SCREEN);
    return {
      ...k,
      notificationsToday: 0,
      radar: {
        ...k.radar,
        activeMybarRequests: 0,
        delayedRoomOrders: 0,
        pendingPosOrders: 0,
        byHotel: k.radar.byHotel.map((h) => ({ ...h, activeMybarRequests: 0, delayedRoomOrders: 0, pendingPosOrders: 0 })),
      },
    };
  })(hotelId);
}
