"use client";

import { unsubscribePushAction } from "@/modules/core/server/pushActions";

const BOUND_MS = 1000;

async function unsubscribe(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await Promise.allSettled([unsubscribePushAction(endpoint), sub.unsubscribe()]);
}

/** Çıkıştan önce bu cihazın push aboneliğini kaldırır; en çok 1 sn bekler, asla fırlatmaz. */
export async function unsubscribePushOnLogout(): Promise<void> {
  try {
    await Promise.race([unsubscribe(), new Promise<void>((resolve) => setTimeout(resolve, BOUND_MS))]);
  } catch {
    // en iyi çaba: çıkış engellenmez
  }
}
