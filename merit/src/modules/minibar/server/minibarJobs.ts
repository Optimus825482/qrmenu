import type { RoleKind } from "@/generated/prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { env } from "@/lib/env";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDay, TZ } from "@/lib/time";
import { getAbnormalConsumption } from "./abnormalConsumptionService";
import { addDays, dayRange } from "./dates";

/*
 * Minibar background jobs (pg-boss, Europe/Nicosia):
 *   00:01 task generation · 08:00 daily task report · 08:05 consumption report ·
 *   10:00 / 18:00 missing-occupancy alert · 23:59 DND day-end rollover.
 * Mail jobs send ONE message per hotel containing only that hotel's data, to the active users with
 * the targeted role kinds who are bound to that hotel (User.hotelId or UserHotel). Every send is
 * recorded in EmailLog under a deterministic tracking id (kind, hotel, business day), so a retry
 * of the same job never mails the same hotel twice.
 */

/** Role kinds that receive the minibar mails. */
const MAIL_KINDS: RoleKind[] = ["YONETIM", "MINIBAR", "SISTEM"];

export const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const link = (path: string): string => `${env.APP_BASE_URL.replace(/\/+$/, "")}${path}`;

type MailHotel = {
  id: string;
  name: string;
  emailReportEnabled: boolean;
  emailAlertEnabled: boolean;
};

async function activeHotels(): Promise<MailHotel[]> {
  return prisma.hotel.findMany({
    where: { isActive: true },
    select: { id: true, name: true, emailReportEnabled: true, emailAlertEnabled: true },
    orderBy: { name: "asc" },
  });
}

/** The hotel flag AND the (hotel-overridable) setting must both be on. */
async function mailEnabled(hotel: MailHotel, flag: "report" | "alert"): Promise<boolean> {
  const hotelFlag = flag === "report" ? hotel.emailReportEnabled : hotel.emailAlertEnabled;
  if (!hotelFlag) return false;
  return flag === "report"
    ? (await getSetting("email.reportEnabled", hotel.id)) === true
    : (await getSetting("email.alertEnabled", hotel.id)) === true;
}

/** Active users with an e-mail address, a targeted role kind and a binding to `hotelId`. */
export async function hotelRecipients(
  hotelId: string,
  kinds: RoleKind[] = MAIL_KINDS,
): Promise<{ id: string; email: string; fullName: string }[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      email: { not: null },
      role: { kind: { in: kinds } },
      OR: [{ hotelId }, { userHotels: { some: { hotelId } } }],
    },
    select: { id: true, email: true, fullName: true },
    orderBy: { email: "asc" },
  });
  const seen = new Set<string>();
  const out: { id: string; email: string; fullName: string }[] = [];
  for (const u of users) {
    const email = u.email?.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push({ id: u.id, email, fullName: u.fullName });
  }
  return out;
}

export type MailOutcome = "sent" | "deduped" | "failed" | "no-recipients";

const PENDING_STALE_MS = 15 * 60_000;

/**
 * Sends one mail for (hotel, kind, business day) at most once. The EmailLog row (unique tracking
 * id) is the lock: a second run finds it GONDERILDI (or freshly BEKLEMEDE) and does nothing; a
 * HATA row is retried.
 */
export async function sendHotelMailOnce(params: {
  hotelId: string;
  kind: string;
  day: string;
  subject: string;
  html: string;
  recipients: { id: string; email: string }[];
}): Promise<MailOutcome> {
  const { hotelId, kind, day, subject, html, recipients } = params;
  if (recipients.length === 0) return "no-recipients";
  const trackingId = `${kind}:${hotelId}:${day}`;
  const to = recipients.map((r) => r.email).join(", ");

  let logId: string;
  try {
    const row = await prisma.emailLog.create({
      data: { to, subject, kind, status: "BEKLEMEDE", trackingId, refType: kind, refId: `${hotelId}:${day}` },
    });
    logId = row.id;
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "P2002") throw error;
    const existing = await prisma.emailLog.findUnique({ where: { trackingId } });
    if (!existing) return "deduped";
    const fresh = Date.now() - existing.updatedAt.getTime() < PENDING_STALE_MS;
    if (existing.status === "GONDERILDI" || (existing.status === "BEKLEMEDE" && fresh)) return "deduped";
    await prisma.emailLog.update({
      where: { id: existing.id },
      data: { status: "BEKLEMEDE", to, subject, error: null },
    });
    logId = existing.id;
  }

  const ok = await sendMail({ to: recipients.map((r) => r.email), subject, html });
  await prisma.emailLog.update({
    where: { id: logId },
    data: ok
      ? { status: "GONDERILDI", error: null }
      : { status: "HATA", error: isMailConfigured() ? "Gönderim başarısız" : "SMTP yapılandırılmamış" },
  });
  return ok ? "sent" : "failed";
}

function shell(title: string, subtitle: string, body: string, cta?: { href: string; label: string }): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <div style="background: #0f172a; color: #ffffff; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; color: #fbbf24;">${esc(title)}</h2>
        <p style="margin: 5px 0 0; font-size: 13px; color: #cbd5e1;">${esc(subtitle)}</p>
      </div>
      <div style="padding: 24px; color: #334155; line-height: 1.5;">
        ${body}
        ${
          cta
            ? `<div style="margin-top: 24px; text-align: center;"><a href="${esc(cta.href)}" style="background: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">${esc(cta.label)}</a></div>`
            : ""
        }
      </div>
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px; text-align: center; font-size: 11px; color: #94a3b8;">
        Bu e-posta F&amp;B Command Center otomasyonu tarafından oluşturulmuştur.
      </div>
    </div>`;
}

/**
 * 10:00 / 18:00 - Günlük doluluk yüklenmediyse, o otelin yetkililerine (yalnız o otel) uyarı.
 */
export async function checkOccupancyUploadAndAlert(now = new Date()): Promise<{
  checkedHotels: number;
  missingHotels: string[];
  alertSent: boolean;
}> {
  const day = businessDate(now);
  // 10:00 and 18:00 are separate alerts: each slot has its own once-per-day mail.
  const slot = Number(formatInTimeZone(now, TZ, "H")) < 14 ? "am" : "pm";
  const hotels = await activeHotels();
  const missing: string[] = [];
  let sentAny = false;

  for (const hotel of hotels) {
    const upload = await prisma.occupancyUpload.findFirst({
      where: { hotelId: hotel.id, status: { not: "SILINDI" }, createdAt: dayRange(day) },
      select: { id: true },
    });
    if (upload) continue;
    missing.push(hotel.name);
    if (!(await mailEnabled(hotel, "alert"))) continue;

    const recipients = await hotelRecipients(hotel.id);
    const html = shell(
      "MERIT ROYAL HOTELS & RESORTS",
      "F&B Command Center · Minibar Takip Sistemi",
      `<div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
         <h3 style="margin: 0 0 4px; color: #991b1b; font-size: 15px;">DİKKAT: Günlük doluluk verisi eksik</h3>
         <p style="margin: 0; font-size: 13px; color: #7f1d1d;">${esc(day)} için <strong>${esc(hotel.name)}</strong> oda doluluk Excel girişi henüz tamamlanmamıştır.</p>
       </div>
       <p style="font-size: 13px; color: #475569;">Kat sorumlularının görevleri doğru önceliklendirebilmesi için lütfen doluluk dosyasını yükleyiniz.</p>`,
      { href: link("/depo/doluluk-yukle"), label: "Doluluk Giriş Ekranını Aç" },
    );
    const outcome = await sendHotelMailOnce({
      hotelId: hotel.id,
      kind: `minibar.occupancy-alert.${slot}`,
      day,
      subject: `[DİKKAT] ${hotel.name} - Doluluk girişi eksik - ${day}`,
      html,
      recipients,
    });
    if (outcome === "sent") sentAny = true;
  }

  return { checkedHotels: hotels.length, missingHotels: missing, alertSent: sentAny };
}

/** Business day before `now`. */
const yesterdayOf = (now: Date): string => addDays(businessDate(now), -1);

/**
 * 08:00 - Dünün tamamlanamayan görevleri ve anormal tüketim raporu (otel başına bir e-posta).
 */
export async function sendDailyTaskReport(now = new Date()): Promise<{
  reportDate: string;
  sent: boolean;
  hotelsSent: number;
}> {
  const reportDate = yesterdayOf(now);
  let hotelsSent = 0;

  for (const hotel of await activeHotels()) {
    if (!(await mailEnabled(hotel, "report"))) continue;

    const pending = await prisma.dailyTaskItem.findMany({
      where: { task: { hotelId: hotel.id, date: businessDay(reportDate) }, status: { not: "TAMAMLANDI" } },
      include: { room: { include: { floor: true } } },
      orderBy: [{ room: { floor: { number: "asc" } } }, { room: { number: "asc" } }],
    });
    const abnormal = await getAbnormalConsumption({ hotelId: hotel.id, date: reportDate });
    const recipients = await hotelRecipients(hotel.id);

    const pendingRows = pending
      .slice(0, 30)
      .map(
        (t) => `<tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 6px 10px; font-weight: bold;">Oda ${esc(t.room.number)}</td>
          <td style="padding: 6px 10px; color: #64748b;">${esc(t.room.floor.name)}</td>
          <td style="padding: 6px 10px; text-align: center;">${esc(t.status)}</td>
        </tr>`,
      )
      .join("");
    const abnormalRows = abnormal.roomAnomalies
      .slice(0, 10)
      .map(
        (a) => `<tr style="border-bottom: 1px solid #fef2f2;">
          <td style="padding: 6px 10px; font-weight: bold; color: #dc2626;">Oda ${esc(a.roomNumber)}</td>
          <td style="padding: 6px 10px;">${esc(a.floorName)}</td>
          <td style="padding: 6px 10px; text-align: center;">${esc(a.totalQuantity)} Adet (${esc(a.replenishmentCount)} Dolum)</td>
        </tr>`,
      )
      .join("");

    const html = shell(
      hotel.name,
      `Günlük Minibar Görev Raporu · ${reportDate}`,
      `<h3 style="font-size: 14px; margin: 0 0 8px;">Tamamlanamayan / açık kalan görevler (${pending.length})</h3>
       <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;"><tbody>
         ${pendingRows || '<tr><td style="padding: 12px; text-align: center; color: #16a34a; font-weight: bold;">Tüm odalar kontrol edilmiştir.</td></tr>'}
       </tbody></table>
       <h3 style="font-size: 14px; margin: 0 0 8px;">Anormal tüketim (${abnormal.roomAnomalies.length} oda)</h3>
       <table style="width: 100%; border-collapse: collapse; font-size: 12px;"><tbody>
         ${abnormalRows || '<tr><td style="padding: 12px; text-align: center; color: #64748b;">Anormal tüketim yok.</td></tr>'}
       </tbody></table>`,
      { href: link("/depo/raporlar"), label: "Detaylı Raporlar" },
    );
    const outcome = await sendHotelMailOnce({
      hotelId: hotel.id,
      kind: "minibar.daily-report",
      day: reportDate,
      subject: `[GÜNLÜK RAPOR] ${hotel.name} - ${reportDate} Minibar görev özeti`,
      html,
      recipients,
    });
    if (outcome === "sent") hotelsSent++;
  }

  return { reportDate, sent: hotelsSent > 0, hotelsSent };
}

/**
 * 08:05 - Dünün tüketim toplamları (otel başına bir e-posta, yalnız o otelin katları).
 */
export async function sendDailyConsumptionReport(now = new Date()): Promise<{
  reportDate: string;
  sent: boolean;
  hotelsSent: number;
}> {
  const reportDate = yesterdayOf(now);
  let hotelsSent = 0;

  for (const hotel of await activeHotels()) {
    if (!(await mailEnabled(hotel, "report"))) continue;

    const items = await prisma.minibarTransactionItem.findMany({
      where: {
        consumed: { gt: 0 },
        transaction: { hotelId: hotel.id, occurredAt: dayRange(reportDate) },
      },
      select: {
        consumed: true,
        transaction: { select: { roomId: true, room: { select: { floor: { select: { name: true, number: true } } } } } },
      },
    });
    const floors = new Map<string, { name: string; number: number; qty: number; rooms: Set<string> }>();
    let total = 0;
    for (const it of items) {
      const f = it.transaction.room.floor;
      const row = floors.get(f.name) ?? { name: f.name, number: f.number, qty: 0, rooms: new Set<string>() };
      row.qty += it.consumed;
      row.rooms.add(it.transaction.roomId);
      floors.set(f.name, row);
      total += it.consumed;
    }
    const rows = [...floors.values()]
      .sort((a, b) => a.number - b.number)
      .map(
        (f) => `<tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px 12px;">${esc(f.name)}</td>
          <td style="padding: 8px 12px; text-align: center;">${f.rooms.size} Oda</td>
          <td style="padding: 8px 12px; text-align: right; font-weight: bold;">${f.qty} Adet</td>
        </tr>`,
      )
      .join("");

    const html = shell(
      hotel.name,
      `Günlük Minibar Tüketim Raporu · ${reportDate}`,
      `<p style="font-size: 14px;">Toplam tüketim: <strong>${total} adet</strong></p>
       <table style="width: 100%; border-collapse: collapse; font-size: 12px;"><tbody>
         ${rows || '<tr><td style="padding: 12px; text-align: center; color: #94a3b8;">Tüketim kaydı bulunamadı.</td></tr>'}
       </tbody></table>`,
      { href: link("/depo/raporlar"), label: "Detaylı Raporlar" },
    );
    const outcome = await sendHotelMailOnce({
      hotelId: hotel.id,
      kind: "minibar.consumption",
      day: reportDate,
      subject: `[TÜKETİM] ${hotel.name} - ${reportDate} Minibar tüketim özeti`,
      html,
      recipients: await hotelRecipients(hotel.id),
    });
    if (outcome === "sent") hotelsSent++;
  }

  return { reportDate, sent: hotelsSent > 0, hotelsSent };
}
