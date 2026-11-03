"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/push";
import { type Result, safeAction } from "@/lib/result";
import { subscribePush, subscribeSchema, unsubscribePush } from "./pushSubscriptions";

const noInput = z.undefined();
const endpointSchema = z.string().min(1).max(2048);

/** VAPID genel anahtarı; push yapılandırılmamışsa `null` (arayüz gizlenir). */
export async function getPushPublicKeyAction(): Promise<Result<{ key: string | null }>> {
  return safeAction(noInput, async () => {
    await requireUser();
    return { key: vapidPublicKey() };
  })(undefined);
}

export async function subscribePushAction(input: z.infer<typeof subscribeSchema>): Promise<Result<{ id: string }>> {
  return safeAction(subscribeSchema, async (value) => subscribePush(await requireUser(), value))(input);
}

export async function unsubscribePushAction(endpoint: string): Promise<Result<{ removed: boolean }>> {
  return safeAction(endpointSchema, async (value) => ({
    removed: await unsubscribePush(await requireUser(), value),
  }))(endpoint);
}
