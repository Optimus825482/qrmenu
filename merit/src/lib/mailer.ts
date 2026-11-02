import nodemailer from "nodemailer";

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

/** Test hook: drop the cached transport (the env may have changed). */
export function resetMailTransport(): void {
  transporter = null;
}

function getTransporter(): ReturnType<typeof nodemailer.createTransport> | null {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  return transporter;
}

/** `true` when SMTP_HOST and SMTP_USER are set. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

/**
 * Sends an email through the configured SMTP server. Returns `false` (and logs, never throws) when
 * SMTP is not configured or the send fails; `true` only when the server accepted the message.
 * The sender comes from SMTP_FROM (falling back to SMTP_USER).
 */
export async function sendMail(opts: MailOptions): Promise<boolean> {
  const recipients = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;

  try {
    const transport = getTransporter();
    if (!transport) {
      console.warn(`[MAIL NOT SENT - SMTP UNCONFIGURED] To: ${recipients} | Subject: ${opts.subject}`);
      return false;
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await transport.sendMail({
      from,
      to: recipients,
      subject: opts.subject,
      html: opts.html,
      text: opts.text || opts.subject,
    });

    console.log(`[MAIL SENT] To: ${recipients} | Subject: ${opts.subject}`);
    return true;
  } catch (error) {
    console.error("[MAIL ERROR] Failed to send email:", error);
    return false;
  }
}
