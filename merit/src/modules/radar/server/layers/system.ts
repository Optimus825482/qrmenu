// System layer: derived alerts and the failed-mail counter (the latter for SISTEM sessions only).
import { prisma } from "@/lib/prisma";
import { deriveAlerts, type AlertLayers } from "../../alerts";
import type { RadarSnapshot } from "../../types";
import type { LayerEnv } from "../config";

export type SystemLayer = RadarSnapshot["layers"]["system"];

const MAIL_WINDOW_MS = 24 * 3_600_000;

/** Failed e-mails of the last 24 hours (the mail log carries no hotel, so the count is complex-wide). */
export async function failedMailCount(now: Date, historical = false): Promise<number> {
  const window = { gte: new Date(now.getTime() - MAIL_WINDOW_MS), lte: now };
  // Replay: a mail counts from the moment it failed (`updatedAt`), the same stamp the replay events use.
  return prisma.emailLog.count({ where: { status: "HATA", ...(historical ? { updatedAt: window } : { createdAt: window }) } });
}

export async function systemLayer(env: LayerEnv, layers: AlertLayers): Promise<SystemLayer> {
  const mailFailed = env.isSystem ? await failedMailCount(env.now, env.historical === true) : 0;
  const alerts = deriveAlerts(
    layers,
    env.now,
    {
      callAlertSeconds: env.config.callAlertSeconds,
      mybarStaleMinutes: env.config.mybarStaleMinutes,
      idleMinutes: env.config.idleMinutes,
      approvalEscalationMinutes: env.config.approvalEscalationMinutes,
    },
    { hotelId: env.hotelId, isSystem: env.isSystem, mailFailed },
  );
  return { alerts, mailFailed };
}
