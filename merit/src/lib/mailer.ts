import { resolveSmtp } from "@/modules/reporting/server/mail/resolveSmtp";
import { createMailTransport } from "@/modules/reporting/server/mail/transport";

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Hotel whose SMTP settings apply (hotel row, else system row, else env). Default: system. */
  hotelId?: string | null;
}

/** Kept for old callers: transports are now created per send from the settings (no cached env transport). */
export function resetMailTransport(): void {}

/** `true` when a usable SMTP configuration exists (settings, else SMTP_HOST + SMTP_USER). */
export async function isMailConfigured(hotelId?: string | null): Promise<boolean> {
  return (await resolveSmtp(hotelId)) !== null;
}

/**
 * Direct (unqueued) send through the configured SMTP. Returns `false` (and logs, never throws) when
 * SMTP is not configured or the send fails; `true` only when the server accepted the message.
 * The queue (`reporting/server/mail/queue.ts`) is the reliable path; this is for the legacy callers.
 */
export async function sendMail(opts: MailOptions): Promise<boolean> {
  const recipients = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  try {
    const resolved = await resolveSmtp(opts.hotelId);
    if (!resolved) {
      console.warn(`[MAIL NOT SENT - SMTP UNCONFIGURED] To: ${recipients} | Subject: ${opts.subject}`);
      return false;
    }
    const transport = createMailTransport(resolved.config);
    try {
      const info = await transport.sendMail({
        from: { name: resolved.config.fromName, address: resolved.config.fromEmail },
        to: recipients,
        subject: opts.subject,
        html: opts.html,
        text: opts.text || opts.subject,
      });
      // A server may accept the message while refusing a recipient without raising an error: that is not "sent".
      const rejected = Array.isArray(info?.rejected) ? info.rejected.length : 0;
      if (rejected > 0) {
        console.error(`[MAIL REJECTED] ${rejected} recipient(s) refused by the server | Subject: ${opts.subject}`);
        return false;
      }
    } finally {
      transport.close();
    }
    console.log(`[MAIL SENT] To: ${recipients} | Subject: ${opts.subject}`);
    return true;
  } catch (error) {
    const e = error as { code?: unknown; responseCode?: unknown };
    console.error("[MAIL ERROR] Failed to send email:", { code: e?.code, responseCode: e?.responseCode });
    return false;
  }
}
