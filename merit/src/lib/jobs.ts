import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { TZ } from "@/lib/time";
import { printJobs } from "@/modules/order/server/printJobs";
import { escalation } from "@/modules/order/server/escalation";
import { rsSlaSweep } from "@/modules/order/server/roomService/sla";
import { closeStaleRoomOrders } from "@/modules/order/server/roomService/staleOrders";
import { purgeOperations } from "@/modules/radar/server/operations";
import { presenceSweep } from "@/modules/core/server/sessionPresence";
import { printers } from "@/modules/order/server/printers";
import { notify } from "@/modules/core/server/notifications";
import { type Notifier, sweepSessions } from "@/modules/core/server/sessionSweeper";
import { registerMinibarJobs } from "@/modules/minibar/server/jobs";
import { registerReportingJobs } from "@/modules/reporting/server/jobs";
import { mybarStaleSweep } from "@/modules/mybar/server/staleSweep";
import { mybarCheckoutSweep } from "@/modules/mybar/server/checkout";

export const SESSION_SWEEP_QUEUE = "session.sweep";
export const PRINT_SWEEP_QUEUE = "print.sweep";
export const RS_SLA_SWEEP_QUEUE = "rs.sla-sweep";
export const RS_STALE_ORDERS_QUEUE = "rs.stale-orders";
export const RADAR_PURGE_QUEUE = "radar.purge";
export const ORDER_ESCALATION_QUEUE = "order.escalation";
export const MYBAR_STALE_QUEUE = "mybar.stale-sweep";
export const MYBAR_CHECKOUT_QUEUE = "mybar.checkout-sweep";

const sessionWarnNotifier: Notifier = async (userId, title, body) => {
  await notify({ recipients: [userId], type: "session.warn", title, body });
};

declare global {
  var __pgBoss: Promise<PgBoss> | undefined;
  var __pgBossJobsRegistered: boolean | undefined;
}

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss", max: 4 });
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();
  return boss;
}

/** The process-wide pg-boss instance (started once; cached on globalThis like prisma). */
export function getBoss(): Promise<PgBoss> {
  if (!globalThis.__pgBoss) {
    const starting = startBoss();
    globalThis.__pgBoss = starting;
    // A failed start must not be cached forever.
    starting.catch(() => {
      if (globalThis.__pgBoss === starting) globalThis.__pgBoss = undefined;
    });
  }
  return globalThis.__pgBoss;
}

/** Creates the queues, schedules the recurring jobs and attaches their workers. Runs once per process. */
export async function registerJobs(boss: PgBoss): Promise<void> {
  if (globalThis.__pgBossJobsRegistered) return;
  globalThis.__pgBossJobsRegistered = true;
  try {
    await boss.createQueue(SESSION_SWEEP_QUEUE); // idempotent
    await boss.schedule(SESSION_SWEEP_QUEUE, "* * * * *", null, { tz: TZ });
    await boss.work(SESSION_SWEEP_QUEUE, async () => {
      // work() hands over an array of jobs; a sweep covers every open session, so one run is enough.
      await sweepSessions(new Date(), {
        warnMinutes: await getSetting("session.warnBeforeMinutes"),
        idleMinutes: await getSetting("session.idleMinutes"),
        notifier: sessionWarnNotifier,
      });
      // Radar: presence heartbeat + idle transitions. A radar failure must not break the session sweep.
      try {
        await presenceSweep(new Date());
      } catch (err) {
        console.error("[session.sweep] presence", err);
      }
    });
    // Receipts stuck in BASILIYOR (gateway died mid-print) go back to the queue after 60 s.
    await boss.createQueue(PRINT_SWEEP_QUEUE); // idempotent
    await boss.schedule(PRINT_SWEEP_QUEUE, "* * * * *", null, { tz: TZ });
    await boss.work(PRINT_SWEEP_QUEUE, async () => {
      const swept = await printJobs.sweepStale(new Date());
      if (swept > 0) console.log(`[print.sweep] ${swept} baskı işi kuyruğa geri alındı`);
      const silent = await printers.printerSilenceSweep(new Date());
      if (silent > 0) console.log(`[print.sweep] ${silent} yazıcı sessiz`);
    });
    // Room-service SLA: WARN at 80 % and BREACH at 100 % of rs.slaMinutes, each published once.
    await boss.createQueue(RS_SLA_SWEEP_QUEUE); // idempotent
    await boss.schedule(RS_SLA_SWEEP_QUEUE, "* * * * *", null, { tz: TZ });
    await boss.work(RS_SLA_SWEEP_QUEUE, async () => {
      const res = await rsSlaSweep(new Date());
      if (res.warned + res.breached > 0) {
        console.log(`[rs.sla-sweep] ${res.warned} uyarı, ${res.breached} aşım`);
      }
    });
    // Room orders nobody marked delivered within 12 hours are closed hourly so they stop blocking the room.
    await boss.createQueue(RS_STALE_ORDERS_QUEUE); // idempotent
    await boss.schedule(RS_STALE_ORDERS_QUEUE, "0 * * * *", null, { tz: TZ });
    await boss.work(RS_STALE_ORDERS_QUEUE, async () => {
      const closed = await closeStaleRoomOrders(new Date());
      if (closed > 0) console.log(`[rs.stale-orders] ${closed} oda servisi siparişi kapatıldı`);
    });
    // Radar replay traces older than radar.replayRetentionDays (90) are removed every night.
    await boss.createQueue(RADAR_PURGE_QUEUE); // idempotent
    await boss.schedule(RADAR_PURGE_QUEUE, "30 3 * * *", null, { tz: TZ, key: "default" });
    await boss.work(RADAR_PURGE_QUEUE, async () => {
      const removed = await purgeOperations(new Date(), await getSetting("radar.replayRetentionDays"));
      if (removed > 0) console.log(`[radar.purge] ${removed} operasyon izi silindi`);
    });
    await boss.createQueue(ORDER_ESCALATION_QUEUE); // idempotent
    await boss.schedule(ORDER_ESCALATION_QUEUE, "* * * * *", null, { tz: TZ });
    await boss.work(ORDER_ESCALATION_QUEUE, async () => {
      const escalated = await escalation.run(new Date());
      if (escalated > 0) console.log(`[order.escalation] ${escalated} sipariş yükseltildi`);
    });

    // MyBar: a request nobody has seen for radar.mybarStaleMinutes is escalated once to depot / management.
    await boss.createQueue(MYBAR_STALE_QUEUE); // idempotent
    await boss.schedule(MYBAR_STALE_QUEUE, "* * * * *", null, { tz: TZ });
    await boss.work(MYBAR_STALE_QUEUE, async () => {
      const escalated = await mybarStaleSweep(new Date());
      if (escalated > 0) console.log(`[mybar.stale-sweep] ${escalated} talep yükseltildi`);
    });
    // MyBar: open requests of rooms whose guest checked out (occupancy uploads) are cancelled by the system.
    await boss.createQueue(MYBAR_CHECKOUT_QUEUE); // idempotent
    await boss.schedule(MYBAR_CHECKOUT_QUEUE, "* * * * *", null, { tz: TZ });
    await boss.work(MYBAR_CHECKOUT_QUEUE, async () => {
      const cancelled = await mybarCheckoutSweep(new Date());
      if (cancelled > 0) console.log(`[mybar.checkout-sweep] ${cancelled} talep çıkış nedeniyle iptal edildi`);
    });

    // The six queue/DND/upload jobs: 00:01 daily tasks + DND catch-up, 10:00/18:00 upload warnings,
    // minute DND reminders, 23:59 DND day end, 02:00 file cleanup (retired schedules are removed there).
    await registerMinibarJobs(boss);

    // P7: mail queue worker (every minute), log retention, 08:00/08:05 daily reports and the 10:00/18:00 upload mails;
    // also unschedules the legacy minibar.daily-report / minibar.consumption-report crons.
    await registerReportingJobs(boss);
  } catch (err) {
    globalThis.__pgBossJobsRegistered = false;
    throw err;
  }
}
