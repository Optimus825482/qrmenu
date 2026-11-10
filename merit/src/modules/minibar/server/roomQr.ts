import { qrPrintCard, qrPrintPage, type QrPrintTemplate, type QrPrintTheme } from "@/lib/qrPrintPage";
import { renderQrCardsPdf } from "@/lib/qrPdf";
import { zipSync } from "fflate";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateQrToken, isSignedToken, qrUrl, renderQrPng, renderQrSvg, verifyQrToken } from "@/lib/qr";
import { createRateLimiter } from "@/lib/rate-limit";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { businessDate } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import {
  listQuerySchema,
  parseInput,
  publishDefinition,
  toPage,
  type ListQuery,
  type Page,
} from "@/modules/core/server/admin/crud";
import {
  ROOM_GUEST_MESSAGE_MAX,
  ROOM_QR_AUDIT,
  ROOM_QR_PRINT_MAX,
  ROOM_QR_RATE,
  ROOM_QR_RATE_MESSAGE,
} from "./roomQrEvents";

/*
 * Oda QR servisi (MB-TAN, otel kapsamli). Tam token ve QR adresi hicbir listede, denetim
 * kaydinda veya hata mesajinda yer almaz: istemci gorseli `/api/qr/room/{id}` ucundan alir.
 * Indirme/ZIP/baski yollari SADECE okur; token uretimi yalniz generate* fonksiyonlarindadir.
 */

export type RoomQrFormat = "IMZALI" | "ESKI";

export type RoomQrRow = {
  id: string;
  number: string;
  floorId: string;
  floorName: string;
  roomTypeName: string | null;
  isActive: boolean;
  hasQr: boolean;
  format: RoomQrFormat | null;
  tokenTail: string | null;
  qrGeneratedAt: string | null;
  guestMessage: string | null;
};

export type RoomQrFilter = "ALL" | "MISSING" | "LEGACY" | "SIGNED";
export type RoomQrFile = { filename: string; contentType: string; body: Buffer };

const singleLimiter = createRateLimiter(ROOM_QR_RATE.single);
const bulkLimiter = createRateLimiter(ROOM_QR_RATE.bulk);

/** Test yardimcisi: hiz siniri sayaclarini sifirlar. */
export function resetRoomQrLimiters(): void {
  singleLimiter.clear();
  bulkLimiter.clear();
}

function limit(limiter: typeof singleLimiter, userId: string): void {
  if (!limiter.hit(userId).allowed) throw new DomainError("RATE_LIMITED", ROOM_QR_RATE_MESSAGE);
}

const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });
const last4 = (token: string | null): string | null => (token ? token.slice(-4) : null);

const formatOf = (token: string | null, roomId: string): RoomQrFormat | null => {
  if (!token) return null;
  return isSignedToken(token) && verifyQrToken(token, "ROOM", roomId) ? "IMZALI" : "ESKI";
};

const TR_ASCII: Record<string, string> = {
  ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U",
};

/** Dosya adi parcasi: bosluk -> "_", Turkce harf -> ASCII, `[A-Za-z0-9_-]` disindakiler atilir. */
export function fileSafe(text: string): string {
  return text
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_ASCII[c] ?? c)
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

/** CSV hucresi (`;` ayiricili): formul baslangici `'` ile korunur, gerekirse tirnaklanir. */
const csvCell = (raw: string): string => {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

const roomSelect = {
  id: true,
  number: true,
  floorId: true,
  isActive: true,
  qrToken: true,
  qrGeneratedAt: true,
  guestMessage: true,
  floor: { select: { name: true, number: true } },
  roomType: { select: { name: true } },
} satisfies Prisma.RoomSelect;

type RoomRecord = Prisma.RoomGetPayload<{ select: typeof roomSelect }>;

function toRow(r: RoomRecord): RoomQrRow {
  return {
    id: r.id,
    number: r.number,
    floorId: r.floorId,
    floorName: r.floor.name,
    roomTypeName: r.roomType?.name ?? null,
    isActive: r.isActive,
    hasQr: r.qrToken !== null,
    format: formatOf(r.qrToken, r.id),
    tokenTail: last4(r.qrToken),
    qrGeneratedAt: r.qrGeneratedAt ? r.qrGeneratedAt.toISOString() : null,
    guestMessage: r.guestMessage,
  };
}

const byFloorThenNumber = (a: RoomRecord, b: RoomRecord) =>
  a.floor.number - b.floor.number || collator.compare(a.number, b.number);

/** MB-TAN hakki; `assertCan` kapsam disi oteli de (denetleyerek) FORBIDDEN ile reddeder. */
const authorize = (ctx: Ctx, hotelId: string, action: "V" | "D") => assertCan(ctx, "MB-TAN", action, hotelId);

async function loadRoomInHotel(hotelId: string, roomId: string): Promise<RoomRecord> {
  const room = await prisma.room.findFirst({ where: { id: roomId, hotelId }, select: roomSelect });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  return room;
}

const listSchema = listQuerySchema.extend({
  floorId: z.string().min(1).optional(),
  qr: z.enum(["ALL", "MISSING", "LEGACY", "SIGNED"]).optional(),
});

export async function listRoomQr(
  ctx: Ctx,
  hotelId: string,
  raw: z.input<typeof listSchema>,
): Promise<Page<RoomQrRow>> {
  const q = parseInput(listSchema, raw);
  await authorize(ctx, hotelId, "V");
  const rooms = await prisma.room.findMany({
    where: {
      hotelId,
      ...(q.floorId ? { floorId: q.floorId } : {}),
      ...(q.q ? { number: { contains: q.q, mode: "insensitive" as const } } : {}),
    },
    select: roomSelect,
  });
  rooms.sort(byFloorThenNumber);
  const rows = rooms.map(toRow).filter((r) => {
    switch (q.qr) {
      case "MISSING":
        return !r.hasQr;
      case "LEGACY":
        return r.format === "ESKI";
      case "SIGNED":
        return r.format === "IMZALI";
      default:
        return true;
    }
  });
  const start = (q.page - 1) * q.pageSize;
  return toPage(rows.slice(start, start + q.pageSize), rows.length, q as ListQuery);
}

const generateSchema = z.object({ regenerate: z.boolean().optional() }).strict();

export async function generateRoomQr(
  ctx: Ctx,
  hotelId: string,
  roomId: string,
  rawOpts: { regenerate?: boolean },
): Promise<RoomQrRow> {
  const opts = parseInput(generateSchema, rawOpts ?? {});
  await authorize(ctx, hotelId, "D");
  limit(singleLimiter, ctx.user.id);
  const room = await loadRoomInHotel(hotelId, roomId);
  if (!room.isActive) throw new DomainError("CONFLICT", "Pasif odaya QR üretilemez");
  if (room.qrToken && !opts.regenerate) {
    throw new DomainError("CONFLICT", "Bu odanın QR kodu zaten var; yenilemek için onaylayın");
  }
  const token = generateQrToken("ROOM", room.id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Karsilastir-ve-yaz: arada baska bir islem tokeni degistirdiyse sessizce ezme.
    const done = await tx.room.updateMany({
      where: { id: room.id, hotelId, qrToken: room.qrToken },
      data: { qrToken: token, qrGeneratedAt: now },
    });
    if (done.count !== 1) {
      throw new DomainError("CONFLICT", "Oda QR bilgisi bu sırada değişti; sayfayı yenileyip tekrar deneyin");
    }
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: room.qrToken ? ROOM_QR_AUDIT.regenerate : ROOM_QR_AUDIT.generate,
      entity: "Room",
      entityId: room.id,
      before: { tokenTail: last4(room.qrToken) },
      after: { tokenTail: last4(token) },
    });
    await publishDefinition(tx, { entity: "Room", id: room.id, op: "update", hotelId });
  });
  return toRow({ ...room, qrToken: token, qrGeneratedAt: now });
}

const bulkSchema = z
  .object({
    mode: z.enum(["MISSING", "LEGACY", "ALL"]),
    floorId: z.string().min(1).optional(),
    confirmInvalidate: z.boolean().optional(),
  })
  .strict();

export async function generateRoomQrBulk(
  ctx: Ctx,
  hotelId: string,
  rawInput: z.input<typeof bulkSchema>,
): Promise<{ count: number }> {
  const input = parseInput(bulkSchema, rawInput);
  await authorize(ctx, hotelId, "D");
  if (input.mode !== "MISSING" && !input.confirmInvalidate) {
    throw new DomainError("VALIDATION", "Eski QR kodları geçersiz olacak; onaylayın", {
      fieldErrors: { confirmInvalidate: ["Eski QR kodları geçersiz olacak; onaylayın"] },
    });
  }
  limit(bulkLimiter, ctx.user.id);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const rooms = await tx.room.findMany({
      where: { hotelId, isActive: true, ...(input.floorId ? { floorId: input.floorId } : {}) },
      select: { id: true, qrToken: true },
    });
    const targets = rooms.filter((r) => {
      if (input.mode === "ALL") return true;
      if (input.mode === "MISSING") return r.qrToken === null;
      return r.qrToken !== null && formatOf(r.qrToken, r.id) === "ESKI";
    });
    if (targets.length === 0) throw new DomainError("NOT_FOUND", "İşlem yapılacak oda bulunamadı");
    for (const r of targets) {
      await tx.room.update({
        where: { id: r.id },
        data: { qrToken: generateQrToken("ROOM", r.id), qrGeneratedAt: now },
      });
    }
    const replaced = targets.filter((r) => r.qrToken !== null).length;
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: ROOM_QR_AUDIT.bulk,
      entity: "Hotel",
      entityId: hotelId,
      after: { mode: input.mode, floorId: input.floorId ?? null, count: targets.length, replaced },
    });
    await publishDefinition(tx, { entity: "Room", id: hotelId, op: "update", hotelId });
    return { count: targets.length };
  });
}

/** HTML etiketleri soyulur, kontrol karakterleri (satir sonu haric) atilir, kirpilir. */
export function sanitizeGuestMessage(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(/<[^<>]*>/g, "");
  }
  return text
    .replace(/[<>]/g, "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, (c) => (c === "\n" ? c : ""))
    .trim();
}

const messageSchema = z
  .object({
    roomIds: z.array(z.string().min(1)).min(1, "En az bir oda seçin").max(500, "En fazla 500 oda seçilebilir"),
    message: z.string().max(ROOM_GUEST_MESSAGE_MAX * 10, "Mesaj en fazla 500 karakter olabilir").nullable(),
  })
  .strict();

export async function setRoomGuestMessage(
  ctx: Ctx,
  hotelId: string,
  rawInput: z.input<typeof messageSchema>,
): Promise<{ count: number }> {
  const input = parseInput(messageSchema, rawInput);
  await authorize(ctx, hotelId, "D");
  const clean = input.message === null ? "" : sanitizeGuestMessage(input.message);
  if ([...clean].length > ROOM_GUEST_MESSAGE_MAX) {
    throw new DomainError("VALIDATION", "Mesaj en fazla 500 karakter olabilir");
  }
  const ids = [...new Set(input.roomIds)];
  return prisma.$transaction(async (tx) => {
    const found = await tx.room.count({ where: { id: { in: ids }, hotelId } });
    if (found !== ids.length) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
    await tx.room.updateMany({ where: { id: { in: ids }, hotelId }, data: { guestMessage: clean || null } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: ROOM_QR_AUDIT.guestMessage,
      entity: "Room",
      entityId: ids.length === 1 ? ids[0] : undefined,
      after: { count: ids.length, cleared: clean === "", length: [...clean].length },
    });
    await publishDefinition(tx, { entity: "Room", id: ids[0], op: "update", hotelId });
    return { count: ids.length };
  });
}

/** Tek odanin QR dosyasi. YAN ETKISIZ: QR yoksa uretmez, NOT_FOUND verir. */
export async function renderRoomQrFile(ctx: Ctx, roomId: string, format: "svg" | "png"): Promise<RoomQrFile> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      number: true,
      hotelId: true,
      qrToken: true,
      floor: { select: { name: true } },
      hotel: { select: { code: true } },
    },
  });
  // Kapsam disi oda ile olmayan oda ayni cevabi verir (varlik sorgusu yok).
  if (!room || !ctx.hotelIds.includes(room.hotelId)) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  await assertCan(ctx, "MB-TAN", "V", room.hotelId);
  if (!room.qrToken) throw new DomainError("NOT_FOUND", "Bu odanın QR kodu yok");
  const url = await qrUrl(room.qrToken);
  const filename = `${fileSafe(room.hotel.code)}_${fileSafe(room.floor.name)}_Oda${fileSafe(room.number)}_QR.${format}`;
  if (format === "png") return { filename, contentType: "image/png", body: await renderQrPng(url) };
  return {
    filename,
    contentType: "image/svg+xml; charset=utf-8",
    body: Buffer.from(await renderQrSvg(url), "utf8"),
  };
}

async function qrRooms(hotelId: string, opts: { floorId?: string; roomIds?: string[] }) {
  const rooms = await prisma.room.findMany({
    where: {
      hotelId,
      isActive: true,
      qrToken: { not: null },
      ...(opts.floorId ? { floorId: opts.floorId } : {}),
      ...(opts.roomIds ? { id: { in: opts.roomIds } } : {}),
    },
    select: roomSelect,
  });
  rooms.sort(byFloorThenNumber);
  return rooms;
}

/** QR'li aktif odalarin SVG'leri + `etiketler.csv` (UTF-8 BOM, `;`). Token uretmez/yenilemez. */
export async function roomQrZip(
  ctx: Ctx,
  hotelId: string,
  opts: { floorId?: string } = {},
  now: Date = new Date(),
): Promise<{ filename: string; body: Buffer }> {
  await authorize(ctx, hotelId, "V");
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { code: true } });
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
  const rooms = await qrRooms(hotelId, { floorId: opts.floorId });
  if (rooms.length === 0) throw new DomainError("NOT_FOUND", "QR kodu olan oda bulunamadı");
  const enc = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  const lines = ["Oda;Kat;URL"];
  for (const r of rooms) {
    const url = await qrUrl(r.qrToken as string);
    const base = `${fileSafe(hotel.code)}_${fileSafe(r.floor.name)}_Oda${fileSafe(r.number)}_QR`;
    let name = `${base}.svg`;
    for (let n = 2; name in files; n++) name = `${base}_${n}.svg`;
    files[name] = enc.encode(await renderQrSvg(url));
    lines.push([r.number, r.floor.name, url].map(csvCell).join(";"));
  }
  files["etiketler.csv"] = enc.encode(`﻿${lines.join("\n")}\n`);
  const stamp = businessDate(now).replace(/-/g, "");
  return {
    filename: `QR_Kodlari_${fileSafe(hotel.code)}_${stamp}.zip`,
    body: Buffer.from(zipSync(files)),
  };
}

/** Print-ready PDF (A4, six cards a page) of the active rooms' QR codes. Token uretmez/yenilemez. */
export async function roomQrPdf(
  ctx: Ctx,
  hotelId: string,
  opts: { floorId?: string } = {},
  now: Date = new Date(),
): Promise<{ filename: string; body: Buffer }> {
  await authorize(ctx, hotelId, "V");
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { code: true, name: true } });
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
  const rooms = await qrRooms(hotelId, { floorId: opts.floorId });
  if (rooms.length === 0) throw new DomainError("NOT_FOUND", "QR kodu olan oda bulunamadı");
  const cards = [];
  for (const r of rooms) {
    cards.push({
      heading: hotel.name,
      sub: r.floor.name,
      caption: "ODA • ROOM",
      label: r.number,
      url: await qrUrl(r.qrToken as string),
    });
  }
  const stamp = businessDate(now).replace(/-/g, "");
  return {
    filename: `Oda_QR_Kodlari_${fileSafe(hotel.code)}_${stamp}.pdf`,
    body: await renderQrCardsPdf(`${hotel.name} - Oda QR Kartları`, cards),
  };
}

export type RoomQrPrintSheet = {
  hotel: { name: string; logoUrl: string | null };
  cards: { roomNumber: string; floorName: string; svg: string }[];
};

/** Baski verisi: QR'li aktif odalar, en cok 500 kart. Token uretmez. */
export async function roomQrPrintSheet(
  ctx: Ctx,
  hotelId: string,
  opts: { roomIds?: string[]; floorId?: string } = {},
): Promise<RoomQrPrintSheet> {
  await authorize(ctx, hotelId, "V");
  if (opts.roomIds && opts.roomIds.length > ROOM_QR_PRINT_MAX) {
    throw new DomainError("VALIDATION", "En fazla 500 kart yazdırılabilir");
  }
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true, logoUrl: true } });
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
  const rooms = await qrRooms(hotelId, opts);
  if (rooms.length > ROOM_QR_PRINT_MAX) {
    throw new DomainError("VALIDATION", "En fazla 500 kart yazdırılabilir; kata göre süzün");
  }
  const cards = [];
  for (const r of rooms) {
    cards.push({
      roomNumber: r.number,
      floorName: r.floor.name,
      svg: await renderQrSvg(await qrUrl(r.qrToken as string)),
    });
  }
  return { hotel: { name: hotel.name, logoUrl: hotel.logoUrl }, cards };
}

/** Yazdirilabilir oda QR kart sayfasi (masa QR baskisiyla ayni sablon ve temalar). Token uretmez; en cok 500 kart. */
export async function roomQrPrintHtml(
  ctx: Ctx,
  hotelId: string,
  opts: { floorId?: string; roomIds?: string[]; template?: QrPrintTemplate; theme?: QrPrintTheme } = {},
): Promise<string> {
  await authorize(ctx, hotelId, "V");
  if (opts.roomIds && opts.roomIds.length > ROOM_QR_PRINT_MAX) {
    throw new DomainError("VALIDATION", "En fazla 500 kart yazdırılabilir");
  }
  const template = opts.template ?? "stand";
  const theme = opts.theme ?? "royal";
  const [hotel, floors] = await Promise.all([
    prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } }),
    prisma.floor.findMany({ where: { hotelId }, select: { id: true, name: true, number: true }, orderBy: { number: "asc" } }),
  ]);
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
  const rooms = await qrRooms(hotelId, { floorId: opts.floorId, roomIds: opts.roomIds });
  if (rooms.length > ROOM_QR_PRINT_MAX) {
    throw new DomainError("VALIDATION", "En fazla 500 kart yazdırılabilir; kata göre süzün");
  }
  const cards: string[] = [];
  for (const r of rooms) {
    cards.push(
      qrPrintCard(template, theme, {
        hotel: hotel.name,
        title: "MyBar & Oda Servisi",
        pill: r.floor.name,
        caption: "ODA &bull; ROOM",
        label: r.number,
        svg: await renderQrSvg(await qrUrl(r.qrToken as string)),
        ctaTr: "MyBar ve oda servisi için kameranızla okutunuz",
        ctaEn: "Scan with your camera for MyBar &amp; room service",
        ctaShortTr: "Kameranızla okutunuz",
        ctaShortEn: "Scan with your camera",
        ctaBadge: "Okutunuz",
      }),
    );
  }
  return qrPrintPage({
    title: `${hotel.name} - Oda QR Kartları`,
    barTitle: "Oda QR Kartları",
    barName: hotel.name,
    count: `${rooms.length} oda`,
    template,
    theme,
    cards,
    // Secili odalar yazdirilirken kat suzgeci anlamsizdir.
    filter: opts.roomIds
      ? undefined
      : {
          label: "Kat",
          param: "floorId",
          all: "Tüm Katlar",
          value: opts.floorId,
          options: floors.map((f) => ({ id: f.id, label: f.name })),
        },
    empty: "QR kodu üretilmiş aktif oda bulunamadı.",
  });
}
