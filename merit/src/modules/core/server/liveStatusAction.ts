"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { KPI_CELL_SCREENS } from "@/shell/kpiAccess";
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
 * user granted only the widget sees them too. Komuta Merkezi figures the widget does not show are left out, and
 * occupancy is sent only for hotels where the caller may view a Doluluk screen (KPI_CELL_SCREENS.doluluk): the
 * client hides those lines, the server does not hand them over either.
 */
export async function liveStatusKpisAction(hotelId?: string): Promise<Result<CommandCenterKpis>> {
  return safeAction(inputSchema, async (id) => {
    const ctx = await requireUser();
    const k = await getCommandCenterKpis(ctx, id, LIVE_STATUS_SCREEN);
    const occupancyOk = await Promise.all(
      k.radar.byHotel.map(async (h) => {
        for (const code of KPI_CELL_SCREENS.doluluk) if (await can(ctx, code, "V", h.hotelId)) return true;
        return false;
      }),
    );
    const byHotel = k.radar.byHotel.map((h, i) => ({
      ...h,
      ...(occupancyOk[i] ? {} : { totalRooms: 0, occupiedRooms: 0, occupancyPercent: 0 }),
      activeMybarRequests: 0,
      delayedRoomOrders: 0,
      pendingPosOrders: 0,
    }));
    const totalRooms = byHotel.reduce((n, h) => n + h.totalRooms, 0);
    const occupiedRooms = byHotel.reduce((n, h) => n + h.occupiedRooms, 0);
    return {
      ...k,
      notificationsToday: 0,
      radar: {
        totalRooms,
        occupiedRooms,
        occupancyPercent: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
        activeMybarRequests: 0,
        delayedRoomOrders: 0,
        pendingPosOrders: 0,
        byHotel,
      },
    };
  })(hotelId);
}
