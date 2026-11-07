import { randomUUID } from "node:crypto";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { maskedSmtp, resolveSmtp } from "./resolveSmtp";
import { createMailTransport, mapSmtpError, maskEmail, type MailErrorCode } from "./transport";

export const TEST_SEND_TIMEOUT_MS = 15_000;

/** 5 test mails per minute and user. */
export const testSendLimiter = createRateLimiter({ max: 5, windowMs: 60_000 });

export type MaskedSmtp = ReturnType<typeof maskedSmtp>;
export type TestSendResult =
  | { ok: true; messageId: string; to: string; smtp: MaskedSmtp }
  | { ok: false; code: MailErrorCode; message: string; to: string; smtp: MaskedSmtp | null };

/**
 * Sends a synthetic test mail to the CALLER's own address through the SMTP that would be used for
 * `hotelId` (`null` = the system SMTP, SISTEM roles only). Needs `CR-SYS A` on the hotel. The
 * result carries a masked SMTP summary (never the password); the attempt is logged (`kind TEST`,
 * not claimable by the queue) and audited with the masked address.
 */
export async function sendTest(ctx: Ctx, input: { hotelId: string | null }): Promise<TestSendResult> {
  const { hotelId } = input;
  if (hotelId === null) {
    if (ctx.user.roleKind !== "SISTEM") {
      await audit(prisma, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "YETKISIZ_DENEME",
        entity: "AppScreen",
        entityId: "CR-SYS",
        after: { scope: "SYSTEM", action: "A" },
      });
      throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
    }
  } else {
    await assertCan(ctx, "CR-SYS", "A", hotelId);
  }
  const limit = testSendLimiter.hit(ctx.user.id);
  if (!limit.allowed) {
    throw new DomainError("RATE_LIMITED", `Çok sık deneme. ${limit.retryAfterSec} sn sonra tekrar deneyin`);
  }

  const me = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { email: true } });
  const to = me?.email?.trim();
  if (!to) throw new DomainError("VALIDATION", "Hesabınızda e-posta adresi tanımlı değil");

  const resolved = await resolveSmtp(hotelId);
  const smtp = resolved ? maskedSmtp(resolved) : null;
  const subject = `Merit OS test e-postası ${new Date().toISOString().slice(11, 19)}`;

  let result: TestSendResult;
  if (!resolved) {
    result = { ok: false, code: "CONFIG", message: "SMTP ayarları yapılmamış", to: maskEmail(to), smtp };
  } else {
    const transport = createMailTransport(resolved.config);
    try {
      const info = await Promise.race([
        transport.sendMail({
          from: { name: resolved.config.fromName, address: resolved.config.fromEmail },
          to,
          subject,
          text: "Bu ileti SMTP ayarlarını denemek için gönderildi. Yanıtlamanız gerekmez.",
          html: "<p>Bu ileti SMTP ayarlarını denemek için gönderildi. Yanıtlamanız gerekmez.</p>",
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), TEST_SEND_TIMEOUT_MS).unref(),
        ),
      ]);
      result = { ok: true, messageId: String(info.messageId ?? ""), to: maskEmail(to), smtp: smtp! };
    } catch (err) {
      const mapped = mapSmtpError(err, resolved.config.password);
      result = { ok: false, code: mapped.code, message: mapped.message, to: maskEmail(to), smtp };
    } finally {
      transport.close();
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.emailLog.create({
      data: {
        to,
        userId: ctx.user.id,
        subject,
        kind: "TEST",
        template: "TEST",
        hotelId,
        status: result.ok ? "GONDERILDI" : "HATA",
        error: result.ok ? null : result.message,
        trackingId: `test:${randomUUID()}`,
        attempts: 1,
        sentAt: result.ok ? new Date() : null,
        messageId: result.ok ? result.messageId.slice(0, 255) : null,
      },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: hotelId ?? ctx.session.hotelId,
      action: "MAIL_TEST",
      entity: "EmailLog",
      after: { to: maskEmail(to), ok: result.ok, ...(result.ok ? {} : { code: result.code }) },
    });
  });
  return result;
}
