import ExcelJS from "exceljs";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { mybarFilterSchema, mybarFilterWhere } from "./requests";

/**
 * Read-only aggregates of the management window "MyBar Talepleri" (spec §6.6): which actions the
 * actor has in a hotel, and the CSV / XLSX export of the filtered list. Everything is bound to
 * MB-PERS and the hotel of the request; the export needs the management right `A` (same as the
 * unbounded list). The file never carries prices: MyBar is All-Inclusive, so the price rule has
 * nothing to mask and a column for it would be a leak by construction.
 */

const SCREEN = "MB-PERS";
export const EXPORT_MAX = 10_000;

export const mybarExportSchema = mybarFilterSchema.extend({
  format: z.enum(["csv", "xlsx"]).default("csv"),
});
export type MybarExportInput = z.input<typeof mybarExportSchema>;

export type MybarCapabilities = { canCancel: boolean; canExport: boolean };

export async function capabilities(ctx: Ctx, hotelId?: string): Promise<MybarCapabilities> {
  const effective = hotelId ?? ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", effective);
  const canManage = await can(ctx, SCREEN, "A", effective);
  return { canCancel: canManage, canExport: canManage };
}

export const EXPORT_HEADER = [
  "Oda",
  "Kat",
  "Durum",
  "Dil",
  "Eklenecek ürünler (istenen/eklenen)",
  "Çıkarılacak ürünler (istenen/alınan)",
  "Misafir notu",
  "Not (Türkçe)",
  "Oluşturulma",
  "Görüldü (kişi)",
  "Görüldü (zaman)",
  "Kapanış (kişi)",
  "Kapanış (zaman)",
  "Kapanış / iptal notu",
] as const;

const STATUS_TR = { BEKLEMEDE: "Beklemede", TAMAMLANDI: "Tamamlandı", IPTAL: "İptal" } as const;

function when(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleString("tr-TR", {
    timeZone: "Europe/Nicosia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r;]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

const rowInclude = {
  room: { select: { number: true, floor: { select: { name: true } } } },
  seenBy: { select: { fullName: true } },
  completedBy: { select: { fullName: true } },
  cancelledBy: { select: { fullName: true } },
  items: { include: { product: { select: { name: true } } }, orderBy: { createdAt: "asc" as const } },
  removals: { include: { product: { select: { name: true } } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.MybarRequestInclude;

type ExportRow = Prisma.MybarRequestGetPayload<{ include: typeof rowInclude }>;

export type MybarExportFile = { filename: string; mime: string; base64: string; rows: number };

/** Header + rows of display text; both file formats are written from this table. */
export function exportTable(rows: ExportRow[]): string[][] {
  const body = rows.map((r) => [
    r.room.number,
    r.room.floor.name,
    STATUS_TR[r.status],
    r.language,
    r.items.map((it) => `${it.product.name} ${it.requestedQty}/${it.deliveredQty}`).join("; "),
    r.removals.map((it) => `${it.product.name} ${it.requestedQty}/${it.removedQty}`).join("; "),
    r.note ?? "",
    r.noteTr ?? "",
    when(r.createdAt),
    r.seenBy?.fullName ?? "",
    when(r.seenAt),
    r.status === "IPTAL" ? (r.cancelledBy?.fullName ?? "") : (r.completedBy?.fullName ?? ""),
    when(r.status === "IPTAL" ? r.cancelledAt : r.completedAt),
    r.status === "IPTAL" ? (r.cancelNote ?? "") : r.status === "TAMAMLANDI" ? (r.closeNote ?? "") : "",
  ]);
  return [[...EXPORT_HEADER], ...body];
}

export async function exportRequests(ctx: Ctx, rawInput: MybarExportInput = {}): Promise<MybarExportFile> {
  const parsed = mybarExportSchema.safeParse(rawInput);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;
  const hotelId = input.hotelId ?? ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", hotelId);
  await assertCan(ctx, SCREEN, "A", hotelId);

  const where = mybarFilterWhere(hotelId, input);
  const rows = await prisma.mybarRequest.findMany({
    where,
    include: rowInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_MAX + 1,
  });
  if (rows.length > EXPORT_MAX) {
    throw new DomainError("VALIDATION", "En fazla 10.000 satır dışa aktarılır; süzgeçleri daraltın");
  }
  const table = exportTable(rows);

  const stamp = new Date().toISOString().slice(0, 10);
  let file: MybarExportFile;
  if (input.format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("MyBar Talepleri");
    ws.addRows(table);
    ws.getRow(1).font = { bold: true };
    const widths = [8, 14, 12, 6, 44, 44, 36, 36, 17, 20, 17, 20, 17, 40];
    ws.columns.forEach((col, i) => {
      col.width = widths[i] ?? 16;
    });
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    file = {
      filename: `mybar-talepleri-${stamp}.xlsx`,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: buffer.toString("base64"),
      rows: rows.length,
    };
  } else {
    const csv = `﻿${table.map((line) => line.map(csvCell).join(";")).join("\n")}`;
    file = {
      filename: `mybar-talepleri-${stamp}.csv`,
      mime: "text/csv;charset=utf-8",
      base64: Buffer.from(csv, "utf8").toString("base64"),
      rows: rows.length,
    };
  }

  await prisma.$transaction(async (tx) => {
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "MYBAR_EXPORT",
      entity: "MybarRequest",
      after: {
        format: input.format,
        rows: rows.length,
        filters: { status: input.status, from: input.from, to: input.to, q: input.q, unseenOnly: input.unseenOnly },
      },
    });
  });
  return file;
}
