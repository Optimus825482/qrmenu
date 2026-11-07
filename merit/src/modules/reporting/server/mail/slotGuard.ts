import type { MailTemplate } from "./policy";

/**
 * DOUBLE-SEND GUARD (T7 -> T8). Until T8 rewires the daily mails, the legacy minibar cron
 * (`minibarJobs.ts`: 08:00 task report, 08:05 consumption report, hotel
 * level, `trackingId = kind:hotel:day`) still sends these slots. The new queue's dedupe key is
 * per USER (`template:hotel:day:user`), so the two paths do NOT dedupe against each other.
 * `enqueue({ scheduled: true })` therefore refuses a template listed here. T8 MUST, in the same
 * commit that removes/unschedules the legacy cron for a slot, delete that template from this set.
 */
export const LEGACY_CRON_TEMPLATES: Set<MailTemplate> = new Set<MailTemplate>([
  "GOREV",
  "SARFIYAT",
]);

/** Reason text when the legacy cron still owns the slot, else `null`. */
export function guardLegacySlot(template: MailTemplate): string | null {
  return LEGACY_CRON_TEMPLATES.has(template) ? "Bu slotu hâlâ eski minibar zamanlayıcısı gönderiyor" : null;
}
