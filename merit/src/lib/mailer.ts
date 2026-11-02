import nodemailer from "nodemailer";

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

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

/**
 * Sends an email notification using configured SMTP settings.
 * In development or if SMTP is unconfigured, logs the email safely without throwing.
 */
export async function sendMail(opts: MailOptions): Promise<boolean> {
  const recipients = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  const from = process.env.SMTP_FROM || '"Merit Royal F&B Command Center" <noreply@merithotels.com>';

  try {
    const transport = getTransporter();
    if (!transport) {
      console.log(`[MAIL MOCK - SMTP UNCONFIGURED] To: ${recipients} | Subject: ${opts.subject}`);
      return true;
    }

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
