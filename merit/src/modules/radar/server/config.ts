// Effective radar settings of one hotel plus the per-request environment shared by the layer loaders.
import type { Ctx } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { businessDate, businessDay, businessDateStart } from "@/lib/time";
import { parseWallViews } from "../constants";
import type { RadarConfig } from "../types";

export type LayerEnv = {
  ctx: Ctx;
  hotelId: string;
  now: Date;
  /** Business day, yyyy-MM-dd (Europe/Nicosia). */
  today: string;
  /** Value for `@db.Date` columns of the business day. */
  todayDay: Date;
  /** Start instant of the business day (timestamptz range queries). */
  todayStart: Date;
  config: RadarConfig;
  minChecks: number;
  printerSilentSeconds: number;
  /** SISTEM / YONETIM sessions see full names (YONETIM only inside their own hotels). */
  named: boolean;
  isSystem: boolean;
  /** Replay snapshot: `now` is a past instant and the layers rebuild the state as of then. */
  historical?: boolean;
};

const KEYS = [
  "radar.liveBufferMinutes",
  "radar.idleMinutes",
  "radar.mybarStaleMinutes",
  "order.callAlertSeconds",
  "order.approvalEscalationMinutes",
  "rs.slaMinutes",
  "radar.wallRotateSeconds",
  "radar.wallViews",
  "radar.soundOnEscalation",
  "radar.replayRetentionDays",
  "radar.printerSilentSeconds",
  "dnd.minChecks",
] as const;

export async function loadEnv(ctx: Ctx, hotelId: string, now: Date, historical = false): Promise<LayerEnv> {
  const s = await getSettings(KEYS, hotelId);
  const today = businessDate(now);
  return {
    ctx,
    hotelId,
    now,
    today,
    todayDay: businessDay(today),
    todayStart: businessDateStart(today),
    config: {
      liveBufferMinutes: s["radar.liveBufferMinutes"],
      idleMinutes: s["radar.idleMinutes"],
      mybarStaleMinutes: s["radar.mybarStaleMinutes"],
      callAlertSeconds: s["order.callAlertSeconds"],
      approvalEscalationMinutes: s["order.approvalEscalationMinutes"],
      slaMinutes: s["rs.slaMinutes"],
      wallRotateSeconds: s["radar.wallRotateSeconds"],
      wallViews: parseWallViews(s["radar.wallViews"]),
      soundOnEscalation: s["radar.soundOnEscalation"],
      replayRetentionDays: s["radar.replayRetentionDays"],
    },
    minChecks: s["dnd.minChecks"],
    printerSilentSeconds: s["radar.printerSilentSeconds"],
    named: ctx.user.roleKind === "SISTEM" || ctx.user.roleKind === "YONETIM",
    isSystem: ctx.user.roleKind === "SISTEM",
    ...(historical ? { historical: true } : {}),
  };
}

/** Display name for a user, or an em dash when the viewer's role may not see names. */
export const nameFor = (env: LayerEnv, fullName: string): string => (env.named ? fullName : "—");
