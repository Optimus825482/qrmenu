import { sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { notify } from "@/modules/core/server/notifications";
import { loadTranslationConfig } from "./translations";

export type DeeplUsage = {
  used: number;
  limit: number;
  remaining: number;
  /** Whole percent of the limit still available (0–100). */
  remainingPercent: number;
  plan: "FREE" | "PRO";
};

export type DeeplQuotaLevel = "OK" | "LOW" | "CRITICAL";

/** Remaining share of the limit at or under which the quota counts as low / nearly exhausted. */
export const DEEPL_LOW_PERCENT = 20;
export const DEEPL_CRITICAL_PERCENT = 5;
/** While the quota stays low the same level is announced at most once in this many days. */
const REPEAT_DAYS = 7;
export const DEEPL_QUOTA_NOTIFICATION = "translation.deepl-quota";
const SYSTEM_ADMIN_ROLE = "R-SYS";
const USAGE_TIMEOUT_MS = 8000;

export function deeplQuotaLevel(usage: Pick<DeeplUsage, "remainingPercent">): DeeplQuotaLevel {
  if (usage.remainingPercent <= DEEPL_CRITICAL_PERCENT) return "CRITICAL";
  if (usage.remainingPercent <= DEEPL_LOW_PERCENT) return "LOW";
  return "OK";
}

/** Characters used and allowed in the current DeepL billing period, straight from DeepL (`/v2/usage`). */
export async function fetchDeeplUsage(apiKey: string): Promise<DeeplUsage> {
  const free = apiKey.endsWith(":fx");
  const res = await fetch(`https://${free ? "api-free" : "api"}.deepl.com/v2/usage`, {
    headers: { authorization: `DeepL-Auth-Key ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DeepL kullanım bilgisi alınamadı (HTTP ${res.status}).`);
  const data = (await res.json()) as { character_count?: unknown; character_limit?: unknown };
  const used = Number(data.character_count);
  const limit = Number(data.character_limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) {
    throw new Error("DeepL kullanım yanıtı geçersiz.");
  }
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, remainingPercent: Math.floor((remaining / limit) * 100), plan: free ? "FREE" : "PRO" };
}

/** Usage of the key in use (Denetim Masası → Sistem → Çeviri, environment as fallback); `null` without a key. */
export async function getDeeplUsage(apiKeyOverride?: string): Promise<DeeplUsage | null> {
  const apiKey = apiKeyOverride?.trim() || (await loadTranslationConfig()).deeplKey;
  return apiKey ? fetchDeeplUsage(apiKey) : null;
}

const fmt = (n: number) => n.toLocaleString("tr-TR");

/**
 * Hourly: when the DeepL quota is low the system administrators get a notification and an e-mail, and the
 * developer (Arıza Tespit → geliştirici e-postası) an e-mail. One announcement per level per `REPEAT_DAYS`;
 * a failed usage call or an unconfigured SMTP is logged and never throws. Returns the announced level.
 */
export async function deeplQuotaSweep(now: Date): Promise<DeeplQuotaLevel | null> {
  let usage: DeeplUsage | null;
  try {
    usage = await getDeeplUsage();
  } catch (error) {
    console.warn(`[deepl.quota] ${error instanceof Error ? error.message : "kullanım bilgisi alınamadı"}`);
    return null;
  }
  if (!usage) return null;
  const level = deeplQuotaLevel(usage);
  if (level === "OK") return null;

  const since = new Date(now.getTime() - REPEAT_DAYS * 24 * 60 * 60 * 1000);
  const already = await prisma.notification.findFirst({
    where: { type: DEEPL_QUOTA_NOTIFICATION, refId: level, createdAt: { gte: since } },
    select: { id: true },
  });
  if (already) return null;

  const admins = await prisma.user.findMany({
    where: { isActive: true, role: { code: SYSTEM_ADMIN_ROLE } },
    select: { id: true, email: true },
  });
  const title = level === "CRITICAL" ? "DeepL çeviri kotası bitmek üzere" : "DeepL çeviri kotası azaldı";
  const body =
    `Kalan: ${fmt(usage.remaining)} / ${fmt(usage.limit)} karakter (%${usage.remainingPercent}). ` +
    "Kota bittiğinde menü ve misafir notu çevirileri yedek servise düşer; yedek yoksa notlar orijinal diliyle görünür.";

  if (admins.length > 0) {
    await notify({
      recipients: admins.map((a) => a.id),
      type: DEEPL_QUOTA_NOTIFICATION,
      title,
      body,
      refType: "DeeplQuota",
      refId: level,
    });
  } else {
    console.error("[deepl.quota] sistem yöneticisi bulunamadı, bildirim yazılmadı");
  }

  const developer = (await getSetting("diagnostic.developerEmail"))?.trim();
  const to = [...new Set([...admins.map((a) => a.email?.trim()), developer].filter((e): e is string => Boolean(e)))];
  if (to.length > 0) {
    await sendMail({
      to,
      subject: `[Merit] ${title} (%${usage.remainingPercent} kaldı)`,
      text: `${title}\n\n${body}\n\nPlan: DeepL API ${usage.plan === "FREE" ? "Free" : "Pro"}\nKullanılan: ${fmt(usage.used)} karakter`,
      html:
        `<p><strong>${title}</strong></p><p>${body}</p>` +
        `<p>Plan: DeepL API ${usage.plan === "FREE" ? "Free" : "Pro"}<br>Kullanılan: ${fmt(usage.used)} karakter</p>` +
        "<p>Denetim Masası → Sistem → Çeviri ekranından güncel kotayı görebilirsiniz.</p>",
    });
  }
  console.log(`[deepl.quota] ${level}: %${usage.remainingPercent} kaldı, ${admins.length} yönetici, ${to.length} e-posta`);
  return level;
}
