import type { EmailLog } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { businessDate, businessDay, formatDayTr } from "@/lib/time";
import { addDays } from "@/modules/minibar/server/dates";
import { MANUAL_VERIFY_ACTION } from "@/modules/minibar/server/roomVerification";
import { PDF_ROW_LIMIT, XLSX_ROW_LIMIT } from "../../constants";
import { dayRange } from "../range";
import { getReport } from "../registry";
import { renderPdf } from "../render/pdf";
import { renderXlsx } from "../render/xlsx";
import { executeReport } from "../run";
import type { ReportResult, ReportRow, ReportScope } from "../types";
import { enqueue } from "./queue";
import { registerComposer, type Composed } from "./sender";

/*
 * Daily report mails: 08:00 task report (GOREV) and 08:05 consumption report (SARFIYAT) for the PREVIOUS
 * business day (Europe/Nicosia). `enqueueDailyReports` queues one EmailLog row per entitled recipient
 * (dedupe `template:hotel:day:user`, so a double trigger is silent); the composers build the HTML summary and
 * the attachments at SEND time from `executeReport` (permission-free internal path; the recipients were
 * already filtered by `usersEntitledTo`).
 */

export type DailyTemplate = "GOREV" | "SARFIYAT";

/** Total attachment budget of one mail; later attachments (the PDF) are dropped first and a note is added to the body. */
export const MAIL_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_TYPE = "application/pdf";

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** The business day the 08:00 / 08:05 mails are about: the one before `now`'s business day. */
export const previousBusinessDate = (now: Date = new Date()): string => addDays(businessDate(now), -1);

export type DailyRun = {
  date: string;
  hotels: number;
  enqueued: number;
  skipped: { hotelId: string; reason: string }[];
};

const TITLE: Record<DailyTemplate, string> = { GOREV: "Günlük Görev Raporu", SARFIYAT: "Günlük Sarfiyat Raporu" };
const subjectOf = (template: DailyTemplate, hotelName: string, day: string): string =>
  `${TITLE[template]} – ${hotelName} – ${formatDayTr(day)}`;

export async function enqueueDailyReports(
  template: DailyTemplate,
  day?: string,
  now: Date = new Date(),
): Promise<DailyRun> {
  const date = day ?? previousBusinessDate(now);
  const hotels = await prisma.hotel.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const out: DailyRun = { date, hotels: hotels.length, enqueued: 0, skipped: [] };
  for (const hotel of hotels) {
    const skip = (reason: string) => out.skipped.push({ hotelId: hotel.id, reason });
    try {
      if (!(await minibarOn(hotel.id))) {
        skip("Minibar modülü kapalı");
        continue;
      }
      // `enqueue` applies mailPolicy and usersEntitledTo (opt-in, role, hotel binding) itself.
      const res = await enqueue({
        template,
        hotelId: hotel.id,
        subject: subjectOf(template, hotel.name, date),
        params: { date },
        businessDate: date,
        scheduled: true,
      });
      if (res.denied) skip(res.denied);
      else if (res.created === 0 && res.skipped === 0) skip("Alıcı yok");
      else out.enqueued += res.created;
    } catch (error) {
      // One hotel must not stop the others.
      console.error(`[mail.daily-${template.toLowerCase()}]`, hotel.id, error);
      skip("Beklenmeyen hata");
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Report access

function scopeOf(hotelId: string, day: string, limit: number): ReportScope {
  return { hotelIds: [hotelId], from: day, to: day, ...dayRange(day, day), limit };
}

async function run(key: string, hotelId: string, day: string, params: Record<string, unknown>, limit: number): Promise<ReportResult> {
  const def = getReport(key);
  if (!def) throw new Error(`Rapor bulunamadı: ${key}`);
  return executeReport(def, scopeOf(hotelId, day, limit), params);
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const sumOf = (rows: ReportRow[], key: string): number => rows.reduce((s, r) => s + num(r[key]), 0);
const pct = (fraction: number): string => `%${Math.round(fraction * 100)}`;
const summaryOf = (r: ReportResult, label: string): string | number | undefined => r.summary?.find((s) => s.label === label)?.value;
const money = (v: number): string => v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Attachment = NonNullable<Composed["attachments"]>[number];

/** Keeps the attachments inside the budget. */
function capAttachments(list: Attachment[]): { kept: Attachment[]; dropped: string[] } {
  const kept: Attachment[] = [];
  const dropped: string[] = [];
  let total = 0;
  for (const a of list) {
    if (total + a.content.length > MAIL_ATTACHMENT_MAX_BYTES) dropped.push(a.filename);
    else {
      kept.push(a);
      total += a.content.length;
    }
  }
  return { kept, dropped };
}

// ---------------------------------------------------------------------------------------------------------
// HTML (table based, inline styles; no script, no SVG, no remote images, no tracking pixel)

const cell = (v: unknown, extra = ""): string => `<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;${extra}">${esc(v)}</td>`;
const head = (v: string, align: string): string =>
  `<th style="padding:6px 10px;background:#f1f5f9;text-align:${align};font-size:12px;">${esc(v)}</th>`;

function table(headers: { t: string; right?: boolean }[], rows: unknown[][]): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;margin:0 0 16px;">
    <tr>${headers.map((h) => head(h.t, h.right ? "right" : "left")).join("")}</tr>
    ${rows.map((r) => `<tr>${r.map((v, i) => cell(v, headers[i]?.right ? "text-align:right;" : "")).join("")}</tr>`).join("")}
  </table>`;
}

const h3 = (t: string): string => `<h3 style="margin:16px 0 8px;font-size:14px;">${esc(t)}</h3>`;
const small = (t: string): string => `<p style="font-size:13px;">${esc(t)}</p>`;

function bar(fraction: number): string {
  const w = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:8px 0 16px;"><tr>
    <td width="${w}%" style="background:#16a34a;height:10px;font-size:0;line-height:0;">&nbsp;</td>
    <td width="${100 - w}%" style="background:#e2e8f0;height:10px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

function layout(p: { title: string; hotelName: string; dateLabel: string; bodyHtml: string }): string {
  const href = `${env.APP_BASE_URL.replace(/\/+$/, "")}/depo/raporlar`;
  return `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;border:1px solid #e2e8f0;">
    <div style="background:#0f172a;color:#ffffff;padding:20px;text-align:center;">
      <h2 style="margin:0;font-size:20px;">${esc(p.hotelName)}</h2>
      <p style="margin:5px 0 0;font-size:13px;">${esc(p.title)} · ${esc(p.dateLabel)}</p>
    </div>
    <div style="padding:24px;color:#334155;line-height:1.5;">
      ${p.bodyHtml}
      <p style="text-align:center;margin-top:24px;"><a href="${esc(href)}" style="background:#0f172a;color:#ffffff;padding:10px 20px;text-decoration:none;display:inline-block;">Detaylı Raporlar</a></p>
    </div>
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px;text-align:center;font-size:11px;color:#94a3b8;">Bu e-posta Merit F&amp;B Command Center tarafından otomatik oluşturulmuştur.</div>
  </div>`;
}

const notDropped = (names: string[]): string =>
  `<p style="font-size:12px;color:#b45309;">Boyut sınırı nedeniyle ek eklenemedi: ${esc(names.join(", "))}. Raporu uygulamadan indirebilirsiniz.</p>`;

async function hotelOf(hotelId: string): Promise<{ name: string; code: string } | null> {
  return prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true, code: true } });
}

async function minibarOn(hotelId: string): Promise<boolean> {
  const row = await prisma.hotelModule.findFirst({ where: { hotelId, moduleKey: "MINIBAR" }, select: { enabled: true } });
  return row?.enabled === true;
}

/** Room verifications by typed room number (audit `ODA_DOGRULAMA_ELLE`) of the business day, oldest first. */
export async function manualRoomEntries(
  hotelId: string,
  day: string,
): Promise<{ room: string; staff: string; time: string }[]> {
  const { start, end } = dayRange(day, day);
  const rows = await prisma.auditLog.findMany({
    where: { hotelId, action: MANUAL_VERIFY_ACTION, createdAt: { gte: start, lt: end } },
    select: { createdAt: true, after: true, user: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  return rows.map((r) => {
    const after = (r.after ?? {}) as { roomNumber?: unknown };
    return {
      room: typeof after.roomNumber === "string" ? after.roomNumber : "-",
      staff: r.user?.fullName ?? "-",
      time: r.createdAt.toLocaleTimeString("tr-TR", { timeZone: "Europe/Nicosia", hour: "2-digit", minute: "2-digit" }),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------
// GOREV

export async function composeDailyTask(p: { hotelId: string; date: string }): Promise<Composed | null> {
  const hotel = await hotelOf(p.hotelId);
  if (!hotel || !(await minibarOn(p.hotelId))) return null;
  const [byType, byStaff] = await Promise.all([
    run("gorev-performans", p.hotelId, p.date, { groupBy: "gun" }, XLSX_ROW_LIMIT),
    run("gorev-performans", p.hotelId, p.date, { groupBy: "personel" }, 200),
  ]);
  const missing = await prisma.dailyTaskItem.findMany({
    where: { status: "EKSIK", task: { hotelId: p.hotelId, date: businessDay(p.date) } },
    select: { room: { select: { number: true } } },
  });
  const missingRooms = [...new Set(missing.map((m) => m.room.number))].sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
  const manual = await manualRoomEntries(p.hotelId, p.date);
  const manualHtml = `${h3(`Elle oda girişi ile yapılan kontroller (${manual.length})`)}
      ${
        manual.length === 0
          ? small("Elle oda girişi yapılmadı.")
          : table([{ t: "Oda" }, { t: "Görevli" }, { t: "Saat" }], manual.map((m) => [m.room, m.staff, m.time]))
      }`;
  const manualText = `Elle oda girişi ile yapılan kontroller (${manual.length}): ${
    manual.map((m) => `Oda ${m.room} ${m.staff} ${m.time}`).join(", ") || "yok"
  }`;

  const rows = byType.rows;
  const total = sumOf(rows, "total");
  const done = sumOf(rows, "done");
  const dnd = sumOf(rows, "dnd");
  const dateLabel = formatDayTr(p.date);
  const subject = `${TITLE.GOREV} – ${hotel.name} – ${dateLabel}${total > 0 ? ` – ${pct(done / total)}` : ""}`;

  let body: string;
  let text: string;
  if (total === 0) {
    const msg = "Bu gün için görev üretilmedi (doluluk dosyaları yüklenmemiş olabilir)";
    body = `<p>${esc(msg)}</p>${manualHtml}`;
    text = [msg, manualText].join("\n");
  } else {
    const typeRows = rows.map((r) => [r.type, num(r.total), num(r.done), num(r.dnd), num(r.missing)]);
    const staffRows = byStaff.rows.map((r) => [r.staff, num(r.items)]);
    const shown = missingRooms.slice(0, 30);
    const more = missingRooms.length > shown.length ? ` +${missingRooms.length - shown.length} daha` : "";
    body = `<p style="font-size:14px;">Genel tamamlanma: <strong>${esc(pct(done / total))}</strong> (${done} / ${total} kalem)</p>
      ${bar(done / total)}
      ${table(
        [{ t: "Görev tipi" }, { t: "Toplam", right: true }, { t: "Tamamlanan", right: true }, { t: "DND bekleyen", right: true }, { t: "Eksik", right: true }],
        typeRows,
      )}
      <p style="font-size:13px;">DND nedeniyle bekleyen kalem: <strong>${dnd}</strong></p>
      ${h3("Personel bazında tamamlanan")}
      ${staffRows.length ? table([{ t: "Personel" }, { t: "Kalem", right: true }], staffRows) : small("Tamamlama kaydı yok.")}
      ${h3(`Eksik odalar (${missingRooms.length})`)}
      ${small(missingRooms.length === 0 ? "Eksik oda yok." : `${shown.join(", ")}${more}`)}
      ${manualHtml}`;
    text = [
      `${hotel.name} – ${dateLabel}`,
      `Genel tamamlanma: ${pct(done / total)} (${done}/${total})`,
      ...typeRows.map((r) => `${r[0]}: toplam ${r[1]}, tamamlanan ${r[2]}, DND ${r[3]}, eksik ${r[4]}`),
      `Personel: ${byStaff.rows.map((r) => `${r.staff} ${num(r.items)}`).join(", ") || "-"}`,
      `Eksik odalar: ${shown.join(", ") || "yok"}${more}`,
      manualText,
    ].join("\n");
  }

  const { kept, dropped } = capAttachments([
    { filename: `gorev-${hotel.code}-${p.date}.xlsx`, content: await renderXlsx(byType), contentType: XLSX_TYPE },
  ]);
  if (dropped.length) body += notDropped(dropped);
  return { subject, html: layout({ title: TITLE.GOREV, hotelName: hotel.name, dateLabel, bodyHtml: body }), text, attachments: kept };
}

// ---------------------------------------------------------------------------------------------------------
// SARFIYAT

export async function composeDailySales(p: { hotelId: string; date: string }): Promise<Composed | null> {
  const hotel = await hotelOf(p.hotelId);
  if (!hotel || !(await minibarOn(p.hotelId))) return null;
  const [products, staff, critical, mybar] = await Promise.all([
    run("tuketim", p.hotelId, p.date, { groupBy: "urun" }, PDF_ROW_LIMIT),
    run("tuketim", p.hotelId, p.date, { groupBy: "personel" }, 200),
    run("zimmet-durum", p.hotelId, p.date, { onlyCritical: true }, 200),
    prisma.mybarRequest.groupBy({
      by: ["status"],
      where: { hotelId: p.hotelId, businessDate: businessDay(p.date) },
      _count: { _all: true },
    }),
  ]);
  const consumed = num(summaryOf(products, "Toplam tüketim"));
  const amount = num(summaryOf(products, "Toplam tutar"));
  const roomsTouched = num(summaryOf(products, "İşlem yapılan oda"));
  const distinct = products.rows.filter((r) => num(r.consumed) > 0).length;
  const mb = (status: string) => mybar.find((m) => m.status === status)?._count._all ?? 0;
  const mbTotal = mybar.reduce((s, m) => s + m._count._all, 0);
  const dateLabel = formatDayTr(p.date);

  // The amount is shown only when at least one consumed line carries a price.
  const kpis: [string, string][] = [
    ["Toplam tüketim", `${consumed} adet`],
    ...(amount > 0 ? ([["Tutar", money(amount)]] as [string, string][]) : []),
    ["İşlem yapılan oda", String(roomsTouched)],
    ["Ürün çeşidi", String(distinct)],
  ];
  const top = products.rows.filter((r) => num(r.consumed) > 0).slice(0, 10).map((r) => [r.d2 ?? r.d1, num(r.consumed)]);
  const added = staff.rows.filter((r) => num(r.added) > 0).slice(0, 10).map((r) => [r.d1, num(r.added)]);
  const crit = critical.rows.slice(0, 15).map((r) => [r.product, num(r.remaining), r.status]);

  const body = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 8px;"><tr>
      ${kpis.map(([k, v]) => `<td style="padding:8px;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;"><div style="font-size:11px;color:#64748b;">${esc(k)}</div><div style="font-size:16px;font-weight:bold;">${esc(v)}</div></td>`).join("")}
    </tr></table>
    ${h3("En çok tüketilen 10 ürün")}
    ${top.length ? table([{ t: "Ürün" }, { t: "Adet", right: true }], top) : small("Tüketim kaydı bulunamadı.")}
    ${h3("Personel bazında eklenen")}
    ${added.length ? table([{ t: "Personel" }, { t: "Eklenen", right: true }], added) : small("Ekleme kaydı yok.")}
    ${h3("Kritik / stok yok ürünler")}
    ${crit.length ? table([{ t: "Ürün" }, { t: "Kalan", right: true }, { t: "Durum" }], crit) : small("Kritik ürün yok.")}
    ${h3("MyBar")}
    <p style="font-size:13px;">Talep: <strong>${mbTotal}</strong> · Tamamlanan: <strong>${mb("TAMAMLANDI")}</strong> · Bekleyen: <strong>${mb("BEKLEMEDE")}</strong> · İptal: <strong>${mb("IPTAL")}</strong></p>`;

  const text = [
    `${hotel.name} – ${dateLabel}`,
    ...kpis.map(([k, v]) => `${k}: ${v}`),
    `En çok tüketilen: ${top.map((r) => `${r[0]} ${r[1]}`).join(", ") || "-"}`,
    `Eklenen: ${added.map((r) => `${r[0]} ${r[1]}`).join(", ") || "-"}`,
    `Kritik: ${crit.map((r) => `${r[0]} (${r[1]})`).join(", ") || "yok"}`,
    `MyBar: talep ${mbTotal}, tamamlanan ${mb("TAMAMLANDI")}, bekleyen ${mb("BEKLEMEDE")}, iptal ${mb("IPTAL")}`,
  ].join("\n");

  const base = `sarfiyat-${hotel.code}-${p.date}`;
  const { kept, dropped } = capAttachments([
    { filename: `${base}.xlsx`, content: await renderXlsx(products), contentType: XLSX_TYPE },
    { filename: `${base}.pdf`, content: await renderPdf(products), contentType: PDF_TYPE },
  ]);
  return {
    subject: subjectOf("SARFIYAT", hotel.name, p.date),
    html: layout({
      title: TITLE.SARFIYAT,
      hotelName: hotel.name,
      dateLabel,
      bodyHtml: body + (dropped.length ? notDropped(dropped) : ""),
    }),
    text,
    attachments: kept,
  };
}

// ---------------------------------------------------------------------------------------------------------

function dateOf(log: EmailLog): string | null {
  const d = ((log.params ?? {}) as { date?: unknown }).date;
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

registerComposer("GOREV", async (log) => {
  const date = dateOf(log);
  return date && log.hotelId ? composeDailyTask({ hotelId: log.hotelId, date }) : null;
});
registerComposer("SARFIYAT", async (log) => {
  const date = dateOf(log);
  return date && log.hotelId ? composeDailySales({ hotelId: log.hotelId, date }) : null;
});
