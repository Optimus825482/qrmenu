import { prisma } from "@/lib/prisma";
import { businessDate } from "@/lib/time";
import { MAIL_LOG_RETENTION_DAYS } from "../../constants";
import { KIND_OF_TEMPLATE, mailPolicy, usersEntitledTo, type MailRecipient, type MailTemplate } from "./policy";
import { deliverClaimed, type DeliverDeps, type DeliverOutcome } from "./sender";
import { guardLegacySlot } from "./slotGuard";

/** A queued row is claimed at most this many times; a transient error on the last one is a dead letter. */
export const MAX_ATTEMPTS = 5;
/** Backoff before claim n+1 (n >= 1): min(60 s * 2^(n-1), 1800 s). */
export const BACKOFF_BASE_SEC = 60;
export const BACKOFF_CAP_SEC = 1800;

/** `dedupeKey` of a queued row: one mail per template, hotel, business day and user. */
export const dedupeKeyOf = (template: MailTemplate, hotelId: string, day: string, userId: string): string =>
  `${template}:${hotelId}:${day}:${userId}`;

export type EnqueueInput = {
  template: MailTemplate;
  hotelId: string;
  subject: string;
  /** Template parameters (JSON). Without a registered composer, `params.html` / `params.text` are sent as is. */
  params?: Record<string, unknown>;
  /** Business day the mail is FOR (part of the dedupe key). Default: today's business day. */
  businessDate?: string;
  /** Default: `usersEntitledTo(template, hotelId)`. */
  recipients?: MailRecipient[];
  /** Set by the scheduled daily/alert jobs: refused while the legacy minibar cron still owns the slot. */
  scheduled?: boolean;
};

export type EnqueueResult = { created: number; skipped: number; denied?: string };

export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  if (input.scheduled) {
    const owned = guardLegacySlot(input.template);
    if (owned) return { created: 0, skipped: 0, denied: owned };
  }
  const policy = await mailPolicy(input.template, input.hotelId);
  if (!policy.allowed) return { created: 0, skipped: 0, denied: policy.reason ?? "Politika izin vermedi" };
  const recipients = input.recipients ?? (await usersEntitledTo(input.template, input.hotelId));
  if (recipients.length === 0) return { created: 0, skipped: 0 };
  const day = input.businessDate ?? businessDate();
  const data = recipients.map((r) => {
    const dedupeKey = dedupeKeyOf(input.template, input.hotelId, day, r.userId);
    return {
      to: r.email,
      userId: r.userId,
      subject: input.subject,
      kind: KIND_OF_TEMPLATE[input.template],
      status: "BEKLEMEDE" as const,
      trackingId: `mq:${dedupeKey}`,
      refType: "MailQueue",
      refId: `${input.hotelId}:${day}`,
      hotelId: input.hotelId,
      template: input.template,
      params: (input.params ?? {}) as object,
      dedupeKey,
    };
  });
  const { count } = await prisma.emailLog.createMany({ data, skipDuplicates: true });
  return { created: count, skipped: data.length - count };
}

/**
 * Atomically claims up to `limit` due rows: one UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP
 * LOCKED) that also bumps `attempts` and `updated_at`. Concurrent workers get disjoint rows; a crashed
 * worker's row becomes due again after its backoff (`updated_at` is the lease/backoff clock).
 */
export async function claimBatch(limit: number, now: Date, maxAttempts = MAX_ATTEMPTS): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "email_logs" SET "attempts" = "attempts" + 1, "updated_at" = ${now}::timestamptz
    WHERE "id" IN (
      SELECT "id" FROM "email_logs"
      WHERE "status" = 'BEKLEMEDE' AND "dedupe_key" IS NOT NULL AND "attempts" < ${maxAttempts}::int
        AND "updated_at" <= ${now}::timestamptz - (
          CASE WHEN "attempts" = 0 THEN 0
               ELSE LEAST(${BACKOFF_BASE_SEC}::int * power(2, "attempts" - 1), ${BACKOFF_CAP_SEC}::int) END
        ) * interval '1 second'
      ORDER BY "created_at", "id"
      LIMIT ${limit}::int
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;
  return rows.map((r) => r.id);
}

export type ProcessResult = Record<DeliverOutcome, number> & { claimed: number };

export async function processQueue(
  opts: { limit?: number; now?: Date; deps?: Partial<DeliverDeps> } = {},
): Promise<ProcessResult> {
  const now = opts.now ?? new Date();
  const maxAttempts = opts.deps?.maxAttempts ?? MAX_ATTEMPTS;
  const ids = await claimBatch(opts.limit ?? 25, now, maxAttempts);
  const out: ProcessResult = { claimed: ids.length, SENT: 0, RETRY: 0, FAILED: 0, CANCELLED: 0 };
  if (ids.length === 0) return out;
  const rows = await prisma.emailLog.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "asc" } });
  for (const row of rows) {
    try {
      out[await deliverClaimed(row, { ...opts.deps, now, maxAttempts })]++;
    } catch (error) {
      // An unexpected bug must not strand the row in a hot loop: it is retried after its backoff.
      console.error("[mail] deliver", row.id, error);
      out.RETRY++;
    }
  }
  return out;
}

/** HATA rows go back to the queue (manual retry from the log panel). Returns false for any other status. */
export async function requeue(emailLogId: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.emailLog.updateMany({
    where: { id: emailLogId, status: "HATA", dedupeKey: { not: null } },
    data: { status: "BEKLEMEDE", attempts: 0, error: null, updatedAt: now },
  });
  return count === 1;
}

/** Retention sweep: removes log rows older than `MAIL_LOG_RETENTION_DAYS`. */
export async function purgeOldLogs(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MAIL_LOG_RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.emailLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
