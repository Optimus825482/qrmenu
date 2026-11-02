"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError, safeAction, type Result } from "@/lib/result";
import { SCREENS } from "../../screens";
import { usersEntitledTo } from "../entitlements";
import { notify } from "../notifications";

const NOTIFICATION_TYPE = "access.request";
const MANAGER_ROLES = ["R-SYS", "R-OTM"];

const inputSchema = z.string().trim().min(1).max(20);

/** Calendar day in the server time zone: one report per user, screen and day. */
function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: process.env.TZ || "Europe/Nicosia" }).format(date);
}

/**
 * "Yöneticine bildir": tells the hotel's system and management users that the caller cannot open
 * a screen. At most one notification per screen, user and day (`already` is true on a repeat);
 * `notified` counts the recipients written.
 */
export async function reportAccessAction(
  screenCode: string,
): Promise<Result<{ notified: number; already: boolean }>> {
  return safeAction(inputSchema, async (code) => {
    const ctx = await requireUser();
    const screen = SCREENS.find((s) => s.code === code);
    if (!screen) throw new DomainError("NOT_FOUND", "Ekran bulunamadı");

    const refId = `${ctx.user.id}:${screen.code}:${dayKey(new Date())}`;
    return prisma.$transaction(async (tx) => {
      // Serialises double taps of the same report.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${refId}))`;
      const existing = await tx.notification.findFirst({
        where: { type: NOTIFICATION_TYPE, refType: "AppScreen", refId },
        select: { id: true },
      });
      if (existing) return { notified: 0, already: true };

      const recipients = await usersEntitledTo(ctx.session.hotelId, MANAGER_ROLES, tx);
      const notified = await notify(
        {
          recipients,
          type: NOTIFICATION_TYPE,
          title: "Yetki isteği",
          body: `${ctx.user.fullName} · ${screen.name}`,
          refType: "AppScreen",
          refId,
        },
        tx,
      );
      return { notified, already: false };
    });
  })(screenCode);
}
