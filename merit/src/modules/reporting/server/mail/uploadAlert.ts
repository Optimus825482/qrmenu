import type { EmailLog } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { businessDate, formatDayTr } from "@/lib/time";
import { missingUploadKinds } from "@/modules/minibar/server/depoService";
import { mailPolicy, usersEntitledTo } from "./policy";
import { enqueue } from "./queue";
import { registerComposer, type Composed } from "./sender";

/*
 * Missing-upload alert (10:00 / 18:00). `enqueueUploadAlerts` queues one EmailLog row per entitled
 * recipient; the composer recomputes the gaps at SEND time and cancels the row (IPTAL) when the
 * files arrived in the meantime. The in-app warning and the radar bridge (G21) live in the minibar
 * jobs; this module only owns the e-mail.
 */

export type UploadSlot = "10:00" | "18:00";
export type MissingUpload = { kind: "IN_HOUSE" | "ARRIVAL" | "DEPARTURE"; label: "In House" | "Arrivals" | "Departures" };

const LABEL: Record<MissingUpload["kind"], MissingUpload["label"]> = {
  IN_HOUSE: "In House",
  ARRIVAL: "Arrivals",
  DEPARTURE: "Departures",
};

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Occupancy files of `day` that are still missing for the hotel (no row at all = all three). */
export async function missingUploads(hotelId: string, day: string): Promise<MissingUpload[]> {
  const kinds = await missingUploadKinds(hotelId, day);
  return kinds.map((kind) => ({ kind, label: LABEL[kind] }));
}

/**
 * The slot is part of the dedupe key through the business-day part (`2026-10-31@10:00`), so the
 * 10:00 and the 18:00 warning are separate mails while a double trigger of one slot is silent.
 */
export const alertDay = (day: string, slot: UploadSlot): string => `${day}@${slot}`;

export type UploadAlertRun = {
  day: string;
  hotels: number;
  enqueued: number;
  skipped: { hotelId: string; reason: string }[];
};

export async function enqueueUploadAlerts(slot: UploadSlot, now: Date = new Date()): Promise<UploadAlertRun> {
  const day = businessDate(now);
  const hotels = await prisma.hotel.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const out: UploadAlertRun = { day, hotels: hotels.length, enqueued: 0, skipped: [] };
  for (const hotel of hotels) {
    const skip = (reason: string) => out.skipped.push({ hotelId: hotel.id, reason });
    try {
      const minibar = await prisma.hotelModule.findFirst({
        where: { hotelId: hotel.id, moduleKey: "MINIBAR" },
        select: { enabled: true },
      });
      if (minibar?.enabled !== true) {
        skip("Minibar modülü kapalı");
        continue;
      }
      const policy = await mailPolicy("YUKLEME_UYARI", hotel.id);
      if (!policy.allowed) {
        skip(policy.reason ?? "Politika izin vermedi");
        continue;
      }
      if ((await missingUploads(hotel.id, day)).length === 0) {
        skip("Eksik yükleme yok");
        continue;
      }
      const recipients = await usersEntitledTo("YUKLEME_UYARI", hotel.id);
      if (recipients.length === 0) {
        skip("Alıcı yok");
        continue;
      }
      const res = await enqueue({
        template: "YUKLEME_UYARI",
        hotelId: hotel.id,
        subject: subjectOf(hotel.name, day, slot),
        params: { day, slot },
        businessDate: alertDay(day, slot),
        recipients,
        scheduled: true,
      });
      if (res.denied) skip(res.denied);
      else out.enqueued += res.created;
    } catch (error) {
      // One hotel must not stop the others.
      console.error("[mail.upload-alert]", hotel.id, error);
      skip("Beklenmeyen hata");
    }
  }
  return out;
}

function subjectOf(hotelName: string, day: string, slot: UploadSlot): string {
  return `Eksik Yükleme Uyarısı – ${hotelName} – ${formatDayTr(day)}${slot === "18:00" ? " (2. uyarı)" : ""}`;
}

/** Builds the mail at send time; `null` = nothing is missing any more (the row becomes IPTAL). */
export async function composeUploadAlert(p: { hotelId: string; day: string; slot: UploadSlot }): Promise<Composed | null> {
  const missing = await missingUploads(p.hotelId, p.day);
  if (missing.length === 0) return null;
  const hotel = await prisma.hotel.findUnique({ where: { id: p.hotelId }, select: { name: true } });
  const name = hotel?.name ?? "";
  const href = `${env.APP_BASE_URL.replace(/\/+$/, "")}/depo/doluluk-yukle`;
  const list = missing.map((m) => m.label);
  const second = p.slot === "18:00";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0;">
      <div style="background: #0f172a; color: #ffffff; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">${esc(name)}</h2>
        <p style="margin: 5px 0 0; font-size: 13px;">Eksik yükleme uyarısı${second ? " (2. uyarı)" : ""}</p>
      </div>
      <div style="padding: 24px; color: #334155; line-height: 1.5;">
        <p><strong>${esc(formatDayTr(p.day))}</strong> için aşağıdaki doluluk dosyaları henüz yüklenmedi:</p>
        <ul>${list.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        <p style="font-size: 13px;">Kat sorumlularının görevleri doğru önceliklendirebilmesi için lütfen dosyaları yükleyiniz.</p>
        <p style="text-align: center;"><a href="${esc(href)}" style="background: #0f172a; color: #ffffff; padding: 10px 20px; text-decoration: none; display: inline-block;">Doluluk Giriş Ekranını Aç</a></p>
      </div>
    </div>`;
  const text = `${name} – ${formatDayTr(p.day)}\nEksik yüklemeler: ${list.join(", ")}\n${href}`;
  return { subject: subjectOf(name, p.day, p.slot), html, text };
}

function paramsOf(log: EmailLog): { day: string; slot: UploadSlot } | null {
  const p = (log.params ?? {}) as { day?: unknown; slot?: unknown };
  if (typeof p.day !== "string" || (p.slot !== "10:00" && p.slot !== "18:00")) return null;
  return { day: p.day, slot: p.slot };
}

registerComposer("YUKLEME_UYARI", async (log) => {
  const params = paramsOf(log);
  if (!params || !log.hotelId) return null;
  return composeUploadAlert({ hotelId: log.hotelId, ...params });
});
