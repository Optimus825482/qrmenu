"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import { mailPanel, mailScopes, retryLog, type MailPanelData, type MailScopes } from "@/modules/reporting/server/mail/panel";
import { sendTest, type TestSendResult } from "@/modules/reporting/server/mail/testSend";

const scopeSchema = z.object({ hotelId: z.string().min(1).max(64).nullable() });
const idSchema = z.object({ id: z.string().min(1).max(64) });

/** Scopes (system / hotels) the caller may open in the E-posta panel. */
export async function mailScopesAction(): Promise<Result<MailScopes>> {
  return safeAction(z.undefined(), async () => mailScopes(await requireUser()))(undefined);
}

/** SMTP source (masked) and the last 50 log rows of one scope. */
export async function listEmailLogAction(hotelId: string | null): Promise<Result<MailPanelData>> {
  return safeAction(scopeSchema, async (i) => mailPanel(await requireUser(), i))({ hotelId });
}

/** Sends a synthetic test mail to the caller's own address (CR-SYS action). */
export async function sendTestMailAction(hotelId: string | null): Promise<Result<TestSendResult>> {
  return safeAction(scopeSchema, async (i) => sendTest(await requireUser(), i))({ hotelId });
}

/** Puts a failed row back in the queue. */
export async function retryEmailLogAction(id: string): Promise<Result<{ id: string }>> {
  return safeAction(idSchema, async (i) => {
    await retryLog(await requireUser(), i.id);
    return { id: i.id };
  })({ id });
}
