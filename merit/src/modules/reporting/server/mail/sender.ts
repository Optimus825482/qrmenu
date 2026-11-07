import type { Transporter } from "nodemailer";
import type { EmailLog } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publishMailFailed } from "@/modules/radar/publish";
import { mailPolicy, usersEntitledTo, MAIL_TEMPLATES, type MailTemplate } from "./policy";
import { resolveSmtp } from "./resolveSmtp";
import { configError, createMailTransport, mapSmtpError } from "./transport";

export type Composed = {
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

/** Builds the message for a queued row; `null` = the condition vanished, the row is cancelled (IPTAL). */
export type Composer = (log: EmailLog) => Promise<Composed | null>;

const composers = new Map<string, Composer>();

/** T8/T9 register their template renderers here. Without one the row's `params.html`/`params.text` are sent. */
export function registerComposer(template: MailTemplate, composer: Composer): void {
  composers.set(template, composer);
}

async function compose(log: EmailLog): Promise<Composed | null | "MISSING"> {
  const custom = log.template ? composers.get(log.template) : undefined;
  if (custom) return custom(log);
  const p = (log.params ?? {}) as Record<string, unknown>;
  if (typeof p.html !== "string") return "MISSING";
  return { subject: log.subject, html: p.html, text: typeof p.text === "string" ? p.text : log.subject };
}

export type DeliverOutcome = "SENT" | "RETRY" | "FAILED" | "CANCELLED";

export type DeliverDeps = {
  transport?: Pick<Transporter, "sendMail">;
  now?: Date;
  /** Attempts (claims) after which a transient error becomes a dead letter. */
  maxAttempts: number;
};

const MAX_ERROR = 300;

type FinalStatus = "GONDERILDI" | "HATA" | "IPTAL" | "BEKLEMEDE";

async function finish(id: string, status: FinalStatus, now: Date, extra: Record<string, unknown> = {}) {
  // Guarded: only the worker that claimed the row (still BEKLEMEDE) may finish it.
  await prisma.emailLog.updateMany({
    where: { id, status: "BEKLEMEDE" },
    data: { status, updatedAt: now, ...extra },
  });
}

function scrub(text: string, secret: string): string {
  const clean = secret.length > 2 ? text.split(secret).join("***") : text;
  return clean.slice(0, MAX_ERROR);
}

/**
 * Delivers ONE already-claimed row (`attempts` was incremented by the claim). Never throws for
 * delivery problems: the outcome is written to the row. SMTP is resolved per row/hotel.
 */
export async function deliverClaimed(log: EmailLog, deps: DeliverDeps): Promise<DeliverOutcome> {
  const now = deps.now ?? new Date();
  const isTest = log.template === "TEST" || log.kind === "TEST";

  if (!isTest) {
    if (log.userId) {
      const u = await prisma.user.findUnique({
        where: { id: log.userId },
        select: { isActive: true, deletedAt: true, emailOptIn: true },
      });
      if (!u || !u.isActive || u.deletedAt || !u.emailOptIn) {
        await finish(log.id, "IPTAL", now, { error: "Gönderim iptal: alıcı e-posta almayı kapattı" });
        return "CANCELLED";
      }
    }
    if (log.hotelId && (MAIL_TEMPLATES as readonly string[]).includes(log.template ?? "")) {
      const policy = await mailPolicy(log.template as MailTemplate, log.hotelId);
      if (!policy.allowed) {
        await finish(log.id, "IPTAL", now, { error: `Gönderim iptal: ${policy.reason ?? "politika"}` });
        return "CANCELLED";
      }
      // Entitlement is re-checked at send time: a role/hotel/e-mail change between enqueue and delivery
      // (retries can lag up to 30 minutes) must not leak a report to a recipient who no longer qualifies.
      if (log.userId) {
        const still = (await usersEntitledTo(log.template as MailTemplate, log.hotelId)).find(
          (r) => r.userId === log.userId,
        );
        if (!still || still.email.trim().toLowerCase() !== (log.to ?? "").trim().toLowerCase()) {
          await finish(log.id, "IPTAL", now, { error: "Gönderim iptal: alıcı artık yetkili değil" });
          return "CANCELLED";
        }
      }
    }
  }

  const composed = await compose(log);
  if (composed === null) {
    await finish(log.id, "IPTAL", now, { error: "Gönderim iptal: koşul ortadan kalktı" });
    return "CANCELLED";
  }
  if (composed === "MISSING") {
    await finish(log.id, "HATA", now, { error: "E-posta şablonu bulunamadı" });
    return "FAILED";
  }

  const resolved = await resolveSmtp(log.hotelId);
  const password = resolved?.config.password ?? "";
  try {
    if (!resolved && !deps.transport) throw configError();
    const transport = deps.transport ?? createMailTransport(resolved!.config);
    const from = resolved
      ? { name: resolved.config.fromName, address: resolved.config.fromEmail }
      : "noreply@merit.invalid";
    const info = await transport.sendMail({
      from,
      to: log.to,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
      attachments: composed.attachments,
    });
    await finish(log.id, "GONDERILDI", now, {
      error: null,
      sentAt: now,
      messageId: String((info as { messageId?: string }).messageId ?? "").slice(0, 255) || null,
      subject: composed.subject,
    });
    return "SENT";
  } catch (err) {
    const mapped = mapSmtpError(err, password);
    const message = scrub(mapped.message, password);
    if (mapped.permanent) {
      await finish(log.id, "HATA", now, { error: message });
      await announce(log);
      return "FAILED";
    }
    if (log.attempts >= deps.maxAttempts) {
      await finish(log.id, "HATA", now, { error: scrub(`Tekrar deneme sınırı aşıldı: ${message}`, password) });
      await announce(log);
      return "FAILED";
    }
    await finish(log.id, "BEKLEMEDE", now, { error: message });
    return "RETRY";
  }
}

async function announce(log: EmailLog): Promise<void> {
  if (!log.hotelId || log.kind === "TEST") return;
  await publishMailFailed(log.hotelId, log.kind, log.template ?? undefined);
}
