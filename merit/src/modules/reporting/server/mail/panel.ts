import type { EmailStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { requeue } from "./queue";
import { maskedSmtp, resolveSmtp } from "./resolveSmtp";

/*
 * Denetim Masası -> E-posta panel service (CR-SYS). `V` (view) shows the SMTP source and the log;
 * `A` (action) sends a test mail or puts a failed row back in the queue. The SYSTEM scope (`null`)
 * is for SISTEM roles only and lists the rows of every hotel plus the system-level test mails.
 */

const SCREEN = "CR-SYS";
export const PANEL_LOG_LIMIT = 50;

export type MailScopes = {
  system: { canAct: boolean } | null;
  hotels: { id: string; name: string; canAct: boolean }[];
};

export type MailLogRow = {
  id: string;
  createdAt: string;
  to: string;
  kind: string;
  template: string | null;
  hotelId: string | null;
  hotelName: string | null;
  subject: string;
  status: EmailStatus;
  attempts: number;
  error: string | null;
  canRetry: boolean;
};

export type MailPanelData = {
  scope: string | null;
  smtp: ReturnType<typeof maskedSmtp> | null;
  canAct: boolean;
  logs: MailLogRow[];
};

/** Scopes the caller may look at (CR-SYS view), with whether they may also act (CR-SYS action). */
export async function mailScopes(ctx: Ctx): Promise<MailScopes> {
  let system: MailScopes["system"] = null;
  if (ctx.user.roleKind === "SISTEM" && (await can(ctx, SCREEN, "V"))) {
    system = { canAct: await can(ctx, SCREEN, "A") };
  }
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const visible: MailScopes["hotels"] = [];
  for (const h of hotels) {
    if (await can(ctx, SCREEN, "V", h.id)) visible.push({ ...h, canAct: await can(ctx, SCREEN, "A", h.id) });
  }
  return { system, hotels: visible };
}

async function assertScope(ctx: Ctx, hotelId: string | null, action: "V" | "A"): Promise<void> {
  if (hotelId === null) {
    await assertCan(ctx, SCREEN, action);
    if (ctx.user.roleKind !== "SISTEM") {
      throw new DomainError("FORBIDDEN", "Sistem geneli e-posta kayıtlarını yalnızca sistem yöneticisi görebilir");
    }
  } else {
    await assertCan(ctx, SCREEN, action, hotelId);
  }
}

export async function mailPanel(ctx: Ctx, input: { hotelId: string | null }): Promise<MailPanelData> {
  const { hotelId } = input;
  await assertScope(ctx, hotelId, "V");
  const [resolved, rows, canAct] = await Promise.all([
    resolveSmtp(hotelId),
    prisma.emailLog.findMany({
      where: hotelId === null ? {} : { hotelId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PANEL_LOG_LIMIT,
      include: { hotel: { select: { name: true } } },
    }),
    (hotelId === null ? can(ctx, SCREEN, "A") : can(ctx, SCREEN, "A", hotelId)),
  ]);
  return {
    scope: hotelId,
    smtp: resolved ? maskedSmtp(resolved) : null,
    canAct,
    logs: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      to: r.to,
      kind: r.kind,
      template: r.template,
      hotelId: r.hotelId,
      hotelName: r.hotel?.name ?? null,
      subject: r.subject,
      status: r.status,
      attempts: r.attempts,
      error: r.error,
      canRetry: canAct && r.status === "HATA" && r.kind !== "TEST",
    })),
  };
}

/** Puts a failed (HATA) queue row back in the queue. Needs CR-SYS `A` on the row's hotel (system rows: SISTEM). */
export async function retryLog(ctx: Ctx, emailLogId: string): Promise<void> {
  const row = await prisma.emailLog.findUnique({
    where: { id: emailLogId },
    select: { id: true, hotelId: true, status: true, kind: true, template: true, to: true },
  });
  if (!row) throw new DomainError("NOT_FOUND", "E-posta kaydı bulunamadı");
  await assertScope(ctx, row.hotelId, "A");
  if (row.status !== "HATA" || row.kind === "TEST") {
    throw new DomainError("CONFLICT", "Yalnızca hatalı kuyruk kayıtları yeniden kuyruğa alınabilir");
  }
  if (!(await requeue(row.id))) {
    throw new DomainError("CONFLICT", "Kayıt artık hata durumunda değil; listeyi yenileyin");
  }
  await audit(prisma, {
    userId: ctx.user.id,
    hotelId: row.hotelId ?? ctx.session.hotelId,
    action: "MAIL_REQUEUE",
    entity: "EmailLog",
    entityId: row.id,
    after: { template: row.template },
  });
}
