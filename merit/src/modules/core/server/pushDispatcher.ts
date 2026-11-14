import { isPushConfigured, type PushOutcome, type PushPayload, sendPush } from "@/lib/push";
import { prisma } from "@/lib/prisma";
import { subscribe, type MeritEvent } from "@/lib/realtime";

/** Aynı anda en çok bu kadar cihaza gönderilir. */
const CONCURRENCY = 8;
/** Bu kadar ardışık başarısızlıktan sonra abonelik silinir. */
const MAX_FAILS = 5;

export type PushNotificationInfo = { refId: string | null; title: string; body: string };
type PushBuilder = (n: PushNotificationInfo) => PushPayload;

/** Push gönderilen bildirim türleri. Diğer türler yalnız zil + SSE ile gider. */
export const PUSH_TYPES = new Map<string, PushBuilder>();

export function registerPushType(type: string, builder: PushBuilder): void {
  PUSH_TYPES.set(type, builder);
}

registerPushType("mybar.created", (n) => ({
  title: "Yeni MyBar talebi",
  body: "Talebi görmek için Merit OS'i açın.",
  url: `/kat/mybar?focus=${encodeURIComponent(n.refId ?? "")}`,
  tag: `mybar-${n.refId ?? "yeni"}`,
}));

// Onay/SLA uyarıları: personel uygulama kapalıyken de duymalı (zil + SSE yetmez).
// Masa çağrısı: kilit ekranında görüneceği için push metni masa/oda numarası, misafir notu veya
// personel adı taşımaz; ayrıntı uygulama içi bildirimde ve SSE'dedir. Hedef çağrı panosu.
registerPushType("call.created", (n) => ({
  title: "Masa çağrısı",
  body: "Yeni bir masa çağrısı var; çağrı panelini açın.",
  url: "/garson/cagrilar",
  tag: `call-created-${n.refId ?? "yeni"}`,
}));
// Yeni sipariş: yalnız başlık/gövde (misafir bilgisi yok); zil + SSE ile aynı bildirim metni.
registerPushType("order.created", (n) => ({
  title: n.title,
  body: n.body,
  url: n.title.startsWith("Yeni oda servisi") ? "/oda-servisi" : "/garson",
  tag: `order-created-${n.refId ?? "yeni"}`,
}));
registerPushType("order.escalated", (n) => ({
  title: n.title,
  body: n.body,
  url: n.title.startsWith("Oda servisi") ? "/oda-servisi" : "/garson",
  tag: `order-escalated-${n.refId ?? "yeni"}`,
}));
registerPushType("order.sla.warn", (n) => ({
  title: n.title,
  body: n.body,
  url: "/oda-servisi",
  tag: `order-sla-${n.refId ?? "yeni"}`,
}));
registerPushType("order.sla.breach", (n) => ({
  title: n.title,
  body: n.body,
  url: "/oda-servisi",
  tag: `order-sla-${n.refId ?? "yeni"}`,
}));

// Minibar uyarıları: kat ekibi ve yöneticileri uygulama kapalıyken de görmeli.
for (const type of ["dnd.marked", "dnd.reminder", "dnd.dayend"]) {
  registerPushType(type, (n) => ({ title: n.title, body: n.body, url: "/kat", tag: `merit-${type}-${n.refId ?? "yeni"}` }));
}
for (const type of ["minibar.manual.created", "minibar.manual.resolved"]) {
  registerPushType(type, (n) => ({ title: n.title, body: n.body, url: "/kat/manuel-kayit", tag: `merit-${type}-${n.refId ?? "yeni"}` }));
}
registerPushType("minibar.correction.resolved", (n) => ({
  title: n.title,
  body: n.body,
  url: "/kat/islemlerim",
  tag: `merit-minibar.correction.resolved-${n.refId ?? "yeni"}`,
}));
registerPushType("stock.critical", (n) => ({
  title: n.title,
  body: n.body,
  url: "/kat/stok",
  tag: `merit-stock.critical-${n.refId ?? "yeni"}`,
}));

// Oda servisi menüsünde tükenen / yeniden açılan ürün: sorumlular uygulama kapalıyken de görmeli.
for (const type of ["rs.menu.soldout", "rs.menu.restocked"]) {
  registerPushType(type, (n) => ({ title: n.title, body: n.body, url: "/oda-servisi/menu", tag: `merit-${type}-${n.refId ?? "yeni"}` }));
}

export type DispatchResult = { claimed: number; sent: number; gone: number; failed: number };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * `notification.created` olayı için kullanıcıların abonelik cihazlarına push gönderir. Çok süreçli
 * kurulumda her süreç olayı duyar; `pushed_at` talebini kazanan süreç gönderir (tam bir kez).
 */
export async function dispatchNotificationEvent(e: MeritEvent): Promise<DispatchResult> {
  const result: DispatchResult = { claimed: 0, sent: 0, gone: 0, failed: 0 };
  if (e.type !== "notification.created" || !e.userIds?.length || !isPushConfigured()) return result;
  const p = e.payload as Record<string, unknown> | undefined;
  const type = str(p?.type);
  const builder = PUSH_TYPES.get(type);
  if (!builder) return result;
  const refId = typeof p?.refId === "string" ? p.refId : null;

  const claimed = await prisma.$queryRaw<{ user_id: string }[]>`
    UPDATE notifications SET pushed_at = now()
    WHERE user_id = ANY(${e.userIds}) AND type = ${type}
      AND ref_id IS NOT DISTINCT FROM ${refId}
      AND pushed_at IS NULL AND created_at > now() - interval '2 minutes'
      AND EXISTS (
        SELECT 1 FROM user_sessions s
        WHERE s.user_id = notifications.user_id AND s.status IN ('ONLINE', 'UYARI') AND s.expires_at > now())
    RETURNING user_id`;
  const userIds = [...new Set(claimed.map((r) => r.user_id))];
  result.claimed = userIds.length;
  if (userIds.length === 0) return result;

  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  const title = str(p?.title) || "Merit OS";
  const body = str(p?.body);
  const payload = builder({ refId, title, body });

  const queue = [...subs];
  const settle = async (sub: (typeof subs)[number], outcome: PushOutcome) => {
    if (outcome === "SENT") {
      result.sent += 1;
      await prisma.pushSubscription.updateMany({ where: { id: sub.id }, data: { lastUsedAt: new Date(), failCount: 0 } });
    } else if (outcome === "GONE") {
      result.gone += 1;
      await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
    } else {
      result.failed += 1;
      const next = sub.failCount + 1;
      if (next >= MAX_FAILS) await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
      else await prisma.pushSubscription.updateMany({ where: { id: sub.id }, data: { failCount: next } });
    }
  };
  const worker = async () => {
    for (let sub = queue.shift(); sub; sub = queue.shift()) {
      const outcome = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
      try {
        await settle(sub, outcome);
      } catch (err) {
        console.error("[push] abonelik durumu yazılamadı", (err as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  if (result.gone + result.failed > 0) {
    console.warn(`[push] ${result.sent} gönderildi, ${result.gone} geçersiz abonelik silindi, ${result.failed} başarısız`);
  }
  return result;
}

declare global {
  var __meritPushUnsub: (() => void) | undefined;
}

/** Gerçek zaman dinleyicisine bağlanır; idempotent. Dönüş fonksiyonu aboneliği kaldırır. */
export function startPushDispatcher(): () => void {
  if (!globalThis.__meritPushUnsub) {
    const off = subscribe(
      (e) => e.type === "notification.created",
      (e) => void dispatchNotificationEvent(e).catch((err) => console.error("[push] dağıtım hatası", (err as Error).message)),
    );
    globalThis.__meritPushUnsub = off;
  }
  return () => {
    globalThis.__meritPushUnsub?.();
    globalThis.__meritPushUnsub = undefined;
  };
}
