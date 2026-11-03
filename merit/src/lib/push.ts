import webpush from "web-push";
import { env } from "@/lib/env";

/** Yük en çok bu kadar bayt olabilir (push servisleri ~4 KB'ı kabul eder; 1 KB bilinçli sınır). */
const MAX_PAYLOAD_BYTES = 1024;
const TTL_SECONDS = 3600;
const TOPIC_MAX = 32;

export type PushPayload = { title: string; body: string; url: string; tag?: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushOutcome = "SENT" | "GONE" | "FAILED";
export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

let vapidOverride: VapidConfig | null | undefined;
let senderOverride: ((target: PushTarget, json: string) => Promise<void>) | null = null;
let vapidApplied: string | null = null;

/** Yalnız testler: `undefined` ortam değişkenlerine döner, `null` push'u kapatır. */
export function setVapidForTests(v: VapidConfig | null | undefined): void {
  vapidOverride = v;
  vapidApplied = null;
}

export function setPushSenderForTests(fn: ((target: PushTarget, json: string) => Promise<void>) | null): void {
  senderOverride = fn;
}

function vapid(): VapidConfig | null {
  if (vapidOverride !== undefined) return vapidOverride;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? env.APP_BASE_URL,
  };
}

export function isPushConfigured(): boolean {
  return vapid() !== null;
}

export function vapidPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

/** JSON yükü; 1 024 baytı aşarsa `body` kısaltılır. */
export function serializePayload(payload: PushPayload): string {
  let body = payload.body;
  let json = JSON.stringify({ ...payload, body });
  while (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES && body.length > 0) {
    const over = Buffer.byteLength(json) - MAX_PAYLOAD_BYTES;
    body = body.slice(0, Math.max(0, body.length - Math.max(1, Math.ceil(over / 2))));
    json = JSON.stringify({ ...payload, body });
  }
  return json;
}

/** Tek aboneliğe gönderir; asla fırlatmaz. 404/410 -> GONE (abonelik ölü). */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
  try {
    const json = serializePayload(payload);
    if (senderOverride) {
      await senderOverride(target, json);
      return "SENT";
    }
    const config = vapid();
    if (!config) return "FAILED";
    if (vapidApplied !== config.publicKey) {
      webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
      vapidApplied = config.publicKey;
    }
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      json,
      {
        TTL: TTL_SECONDS,
        urgency: "high",
        ...(payload.tag ? { topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, TOPIC_MAX) || undefined } : {}),
      },
    );
    return "SENT";
  } catch (err) {
    const status = (err as { statusCode?: number } | null)?.statusCode;
    if (status === 404 || status === 410) return "GONE";
    return "FAILED";
  }
}
