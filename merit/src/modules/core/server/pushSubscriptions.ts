import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";

/** Kullanıcı başına en çok bu kadar cihaz aboneliği; aşılırsa en eski silinir. */
export const MAX_SUBSCRIPTIONS_PER_USER = 10;

/** Bilinen Web Push servisleri; sunucu yalnız bunlara istek atar (SSRF koruması). */
export const DEFAULT_PUSH_ENDPOINT_ALLOWLIST = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "web.push.apple.com",
  "notify.windows.com",
];

function currentAllowlist(): string[] {
  const raw = env.PUSH_ENDPOINT_ALLOWLIST;
  if (!raw) return DEFAULT_PUSH_ENDPOINT_ALLOWLIST;
  const list = raw.split(",").map((v) => v.trim()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_PUSH_ENDPOINT_ALLOWLIST;
}

/** https, kullanıcı bilgisi yok, varsayılan port, ana makine izinli listede (tam ya da `.` ile bağlı sonek). */
export function isAllowedPushEndpoint(endpoint: string, allowlist: string[] = currentAllowlist()): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  return allowlist.some((entry) => {
    const base = entry.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
    return base !== "" && (host === base || host.endsWith("." + base));
  });
}

const UNSUPPORTED_ENDPOINT = "Bu bildirim servisi desteklenmiyor";

export const subscribeSchema = z.object({
  endpoint: z.string().max(2048).refine((value) => isAllowedPushEndpoint(value), UNSUPPORTED_ENDPOINT),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  userAgent: z.string().max(300).optional(),
});
export type SubscribeInput = z.infer<typeof subscribeSchema>;

/**
 * Cihaz aboneliğini kaydeder (endpoint tekil). Aynı cihazı başka kullanıcı alırsa sahiplik devralınır
 * (paylaşılan cihaz). Tercih verisi olduğundan denetim satırı yazılmaz.
 */
export async function subscribePush(ctx: Ctx, raw: SubscribeInput): Promise<{ id: string }> {
  const parsed = subscribeSchema.safeParse(raw);
  if (!parsed.success) {
    const bad = parsed.error.issues.some((i) => i.message === UNSUPPORTED_ENDPOINT);
    throw new DomainError("VALIDATION", bad ? UNSUPPORTED_ENDPOINT : "Geçersiz bildirim aboneliği");
  }
  const input = parsed.data;
  const data = {
    userId: ctx.user.id,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: input.userAgent ?? null,
    failCount: 0,
    lastUsedAt: new Date(),
  };
  const row = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { endpoint: input.endpoint, ...data },
    update: data,
    select: { id: true },
  });
  const extra = await prisma.pushSubscription.findMany({
    where: { userId: ctx.user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_SUBSCRIPTIONS_PER_USER,
    select: { id: true },
  });
  if (extra.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: extra.map((r) => r.id) } } });
  }
  return { id: row.id };
}

/** Yalnız kendi aboneliğini siler; başkasınınki ya da yoksa `false`. */
export async function unsubscribePush(ctx: Ctx, endpoint: string): Promise<boolean> {
  const { count } = await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: ctx.user.id } });
  return count > 0;
}
