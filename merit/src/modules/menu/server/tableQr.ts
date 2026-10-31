import { zipSync } from "fflate";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateQrToken, isSignedToken, qrUrl, renderQrPng, renderQrSvg, verifyQrToken } from "@/lib/qr";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope } from "./menuNodeAccess";

export type TableQrRow = {
  id: string;
  label: string;
  isActive: boolean;
  /** The stored token is an HMAC-signed one issued for this very table. */
  signed: boolean;
  /** Guest URL; empty while the table has no token. */
  url: string;
  assignedWaiter?: { id: string; fullName: string };
};

const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });
const last4 = (token: string | null): string | null => (token ? token.slice(-4) : null);
const isSigned = (token: string | null, tableId: string) =>
  token !== null && isSignedToken(token) && verifyQrToken(token, "TABLE", tableId);

type Access = { hotelId: string; hotelCode: string; outletName: string; outletId: string };

/** Outlet, its hotel and the caller's right (QM-MEN `action`) within the session's hotels/outlet. */
async function authorizeOutlet(ctx: Ctx, outletId: string, action: "V" | "D"): Promise<Access> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, name: true, hotelId: true, hotel: { select: { code: true } } },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  await assertCan(ctx, "QM-MEN", action, outlet.hotelId);
  if (!ctx.hotelIds.includes(outlet.hotelId)) throw new DomainError("FORBIDDEN", "Bu otele erişiminiz yok");
  assertOutletScope(ctx, outlet.id);
  return { hotelId: outlet.hotelId, hotelCode: outlet.hotel.code, outletName: outlet.name, outletId: outlet.id };
}

async function outletOfTable(tableId: string): Promise<string> {
  const table = await prisma.outletTable.findUnique({ where: { id: tableId }, select: { outletId: true } });
  // Same code as an out-of-scope table (authorizeOutlet's FORBIDDEN): no existence oracle.
  if (!table) throw new DomainError("FORBIDDEN", "Bu masaya erişiminiz yok");
  return table.outletId;
}

export async function list(ctx: Ctx, outletId: string): Promise<TableQrRow[]> {
  await authorizeOutlet(ctx, outletId, "V");
  const tables = await prisma.outletTable.findMany({
    where: { outletId },
    select: {
      id: true,
      label: true,
      isActive: true,
      qrToken: true,
      assignments: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { user: { select: { id: true, fullName: true } } },
      },
    },
  });
  tables.sort((a, b) => collator.compare(a.label, b.label));
  return Promise.all(
    tables.map(async (t) => {
      const waiter = t.assignments[0]?.user;
      return {
        id: t.id,
        label: t.label,
        isActive: t.isActive,
        signed: isSigned(t.qrToken, t.id),
        url: t.qrToken ? await qrUrl(t.qrToken) : "",
        ...(waiter ? { assignedWaiter: { id: waiter.id, fullName: waiter.fullName } } : {}),
      };
    }),
  );
}

/** New signed token for one table; the old one stops resolving at once. */
export async function regenerate(ctx: Ctx, tableId: string): Promise<TableQrRow> {
  const outletId = await outletOfTable(tableId);
  const access = await authorizeOutlet(ctx, outletId, "D");
  const token = await prisma.$transaction(async (tx) => {
    const before = await tx.outletTable.findFirst({
      where: { id: tableId, outletId },
      select: { id: true, label: true, qrToken: true },
    });
    if (!before) throw new DomainError("NOT_FOUND", "Masa bulunamadı");
    const next = generateQrToken("TABLE", tableId);
    await tx.outletTable.update({ where: { id: tableId }, data: { qrToken: next } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: access.hotelId,
      action: "TABLE_QR_REGENERATE",
      entity: "OutletTable",
      entityId: tableId,
      before: { qrToken: last4(before.qrToken) },
      after: { label: before.label, signed: true },
    });
    return next;
  });
  const row = await prisma.outletTable.findUniqueOrThrow({
    where: { id: tableId },
    select: { id: true, label: true, isActive: true },
  });
  return { ...row, signed: true, url: await qrUrl(token) };
}

/** Signed tokens for every table of the outlet (or only those without a valid signed one), one transaction. */
export async function regenerateAll(
  ctx: Ctx,
  outletId: string,
  opts: { onlyUnsigned?: boolean } = {},
): Promise<{ count: number }> {
  const access = await authorizeOutlet(ctx, outletId, "D");
  const onlyUnsigned = opts.onlyUnsigned === true;
  return prisma.$transaction(async (tx) => {
    const tables = await tx.outletTable.findMany({
      where: { outletId },
      select: { id: true, qrToken: true },
    });
    const targets = onlyUnsigned ? tables.filter((t) => !isSigned(t.qrToken, t.id)) : tables;
    for (const t of targets) {
      await tx.outletTable.update({ where: { id: t.id }, data: { qrToken: generateQrToken("TABLE", t.id) } });
    }
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: access.hotelId,
      action: "TABLE_QR_REGENERATE_ALL",
      entity: "Outlet",
      entityId: outletId,
      after: { count: targets.length, onlyUnsigned, oldTokenEnds: targets.map((t) => last4(t.qrToken)) },
    });
    return { count: targets.length };
  });
}

const TR_ASCII: Record<string, string> = {
  ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U",
};

/** ASCII-only file name part: Turkish letters transliterated, anything else collapsed to "_". */
export function asciiSlug(text: string): string {
  return text
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_ASCII[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type QrFile = { filename: string; contentType: string; body: Uint8Array };

/** One table's QR as a download (`QM-MEN V`). */
export async function download(ctx: Ctx, tableId: string, format: "svg" | "png"): Promise<QrFile> {
  const outletId = await outletOfTable(tableId);
  const access = await authorizeOutlet(ctx, outletId, "V");
  const table = await prisma.outletTable.findUniqueOrThrow({
    where: { id: tableId },
    select: { label: true, qrToken: true },
  });
  if (!table.qrToken) throw new DomainError("CONFLICT", "Bu masa için QR kodu henüz üretilmedi");
  const url = await qrUrl(table.qrToken);
  const filename = `${[access.hotelCode, access.outletName, table.label].map(asciiSlug).join("_")}_QR.${format}`;
  if (format === "png") return { filename, contentType: "image/png", body: new Uint8Array(await renderQrPng(url)) };
  return {
    filename,
    contentType: "image/svg+xml; charset=utf-8",
    body: new TextEncoder().encode(await renderQrSvg(url)),
  };
}

/** CSV cell: formula-leading values get a `'` prefix (spreadsheet injection); quoted when needed. */
export const csvCell = (raw: string) => {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

async function activeQrTables(outletId: string) {
  const tables = await prisma.outletTable.findMany({
    where: { outletId, isActive: true, qrToken: { not: null } },
    select: { id: true, label: true, qrToken: true },
  });
  tables.sort((a, b) => collator.compare(a.label, b.label));
  return tables;
}

/** All active tables' SVGs plus `etiketler.csv` (label, url) as one ZIP. */
export async function outletZip(ctx: Ctx, outletId: string): Promise<QrFile> {
  const access = await authorizeOutlet(ctx, outletId, "V");
  const tables = await activeQrTables(outletId);
  if (tables.length === 0) throw new DomainError("CONFLICT", "QR kodu üretilmiş aktif masa yok");
  const files: Record<string, Uint8Array> = {};
  const rows = ["etiket,url"];
  const enc = new TextEncoder();
  for (const t of tables) {
    const url = await qrUrl(t.qrToken as string);
    const base = asciiSlug(t.label) || "masa";
    let name = `${base}.svg`;
    for (let n = 2; name in files; n++) name = `${base}_${n}.svg`;
    files[name] = enc.encode(await renderQrSvg(url));
    rows.push(`${csvCell(t.label)},${csvCell(url)}`);
  }
  files["etiketler.csv"] = enc.encode(`﻿${rows.join("\n")}\n`);
  return {
    filename: `${[access.hotelCode, access.outletName].map(asciiSlug).join("_")}_QR.zip`,
    contentType: "application/zip",
    body: zipSync(files),
  };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Print template: 4 columns x 6 rows per A4 page, one card per active table (QR, outlet name, label). */
export async function printHtml(ctx: Ctx, outletId: string): Promise<string> {
  const access = await authorizeOutlet(ctx, outletId, "V");
  const tables = await activeQrTables(outletId);
  const cards: string[] = [];
  for (const t of tables) {
    const svg = await renderQrSvg(await qrUrl(t.qrToken as string));
    cards.push(
      `<div class="card">${svg}<div class="outlet">${esc(access.outletName)}</div><div class="label">${esc(t.label)}</div></div>`,
    );
  }
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(access.outletName)} - Masa QR</title>
<style>
body{margin:0;font-family:Arial,sans-serif}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;padding:8mm}
.card{box-sizing:border-box;border:1px solid #999;padding:3mm;text-align:center;break-inside:avoid;height:42mm;display:flex;flex-direction:column;align-items:center;justify-content:center}
.card svg{width:26mm;height:26mm}
.outlet{font-size:9pt;margin-top:1mm}
.label{font-size:14pt;font-weight:bold}
.empty{padding:24px}
@page{size:A4;margin:0}
@media print{.grid{padding:6mm}}
</style></head><body>
${cards.length ? `<div class="grid">${cards.join("")}</div>` : `<p class="empty">QR kodu üretilmiş aktif masa yok.</p>`}
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`;
}
