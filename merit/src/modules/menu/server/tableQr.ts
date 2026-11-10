import { zipSync } from "fflate";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateQrToken, isSignedToken, qrUrl, renderQrPng, renderQrSvg, verifyQrToken } from "@/lib/qr";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope } from "./menuNodeAccess";
import { parsePrintTemplate, parsePrintTheme } from "./printOptions";

export type TableQrRow = {
  id: string;
  label: string;
  number?: number | null;
  name?: string | null;
  areaId: string;
  areaName?: string | null;
  areaType?: string;
  areaLabel: string;
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

export function formatAreaLabel(area?: { type?: string; name?: string | null } | null): string {
  if (!area) return "Genel Alan";
  if (area.name?.trim()) return area.name.trim();
  return area.type === "ACIK" ? "Açık alan" : "Kapalı alan";
}

type Access = { hotelId: string; hotelCode: string; hotelName: string; outletName: string; outletId: string };

/** Outlet, its hotel and the caller's right (QM-MEN `action`) within the session's hotels/outlet. */
async function authorizeOutlet(ctx: Ctx, outletId: string, action: "V" | "D"): Promise<Access> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: {
      id: true,
      name: true,
      hotelId: true,
      hotel: { select: { code: true, name: true } },
    },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  await assertCan(ctx, "QM-MEN", action, outlet.hotelId);
  if (!ctx.hotelIds.includes(outlet.hotelId)) throw new DomainError("FORBIDDEN", "Bu otele erişiminiz yok");
  assertOutletScope(ctx, outlet.id);
  return {
    hotelId: outlet.hotelId,
    hotelCode: outlet.hotel.code,
    hotelName: outlet.hotel.name,
    outletName: outlet.name,
    outletId: outlet.id,
  };
}

async function outletOfTable(tableId: string): Promise<string> {
  const table = await prisma.outletTable.findUnique({ where: { id: tableId }, select: { outletId: true } });
  // Same code as an out-of-scope table (authorizeOutlet's FORBIDDEN): no existence oracle.
  if (!table) throw new DomainError("FORBIDDEN", "Bu masaya erişiminiz yok");
  return table.outletId;
}

export async function list(ctx: Ctx, outletId: string, opts?: { areaId?: string }): Promise<TableQrRow[]> {
  await authorizeOutlet(ctx, outletId, "V");
  const tables = await prisma.outletTable.findMany({
    where: {
      outletId,
      ...(opts?.areaId ? { areaId: opts.areaId } : {}),
    },
    select: {
      id: true,
      label: true,
      number: true,
      name: true,
      isActive: true,
      qrToken: true,
      areaId: true,
      area: { select: { id: true, type: true, name: true } },
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
        number: t.number,
        name: t.name,
        areaId: t.areaId,
        areaName: t.area?.name ?? null,
        areaType: t.area?.type ?? "KAPALI",
        areaLabel: formatAreaLabel(t.area),
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
    select: {
      id: true,
      label: true,
      number: true,
      name: true,
      isActive: true,
      areaId: true,
      area: { select: { id: true, name: true, type: true } },
    },
  });
  return {
    id: row.id,
    label: row.label,
    number: row.number,
    name: row.name,
    areaId: row.areaId,
    areaName: row.area?.name ?? null,
    areaType: row.area?.type ?? "KAPALI",
    areaLabel: formatAreaLabel(row.area),
    isActive: row.isActive,
    signed: true,
    url: await qrUrl(token),
  };
}

/** Signed tokens for every table of the outlet (or only those without a valid signed one), one transaction. */
export async function regenerateAll(
  ctx: Ctx,
  outletId: string,
  opts: { onlyUnsigned?: boolean; areaId?: string } = {},
): Promise<{ count: number }> {
  const access = await authorizeOutlet(ctx, outletId, "D");
  const onlyUnsigned = opts.onlyUnsigned === true;
  return prisma.$transaction(async (tx) => {
    const tables = await tx.outletTable.findMany({
      where: {
        outletId,
        ...(opts.areaId ? { areaId: opts.areaId } : {}),
      },
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
      after: {
        count: targets.length,
        onlyUnsigned,
        areaId: opts.areaId ?? null,
        oldTokenEnds: targets.map((t) => last4(t.qrToken)),
      },
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

const HOTEL_SHORT_CODES: Record<string, string> = {
  ROYAL: "MR",
  DIAMOND: "MRD",
  PREMIUM: "MRP",
};
const hotelPrefix = (code: string) => HOTEL_SHORT_CODES[code] ?? code;

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
  const prefix = hotelPrefix(access.hotelCode);
  const filename = `${[prefix, access.outletName, table.label].map(asciiSlug).join("_")}_QR.${format}`;
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

async function activeQrTables(outletId: string, areaId?: string, tableId?: string) {
  const tables = await prisma.outletTable.findMany({
    where: {
      outletId,
      isActive: true,
      qrToken: { not: null },
      ...(areaId ? { areaId } : {}),
      ...(tableId ? { id: tableId } : {}),
    },
    select: {
      id: true,
      label: true,
      number: true,
      qrToken: true,
      areaId: true,
      area: { select: { id: true, name: true, type: true } },
    },
  });
  tables.sort((a, b) => collator.compare(a.label, b.label));
  return tables;
}

/** All active tables' SVGs plus `etiketler.csv` (label, url) as one ZIP. */
export async function outletZip(ctx: Ctx, outletId: string, opts?: { areaId?: string }): Promise<QrFile> {
  const access = await authorizeOutlet(ctx, outletId, "V");
  const tables = await activeQrTables(outletId, opts?.areaId);
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
  files["etiketler.csv"] = enc.encode(`\uFEFF${rows.join("\n")}\n`);
  const prefix = hotelPrefix(access.hotelCode);
  return {
    filename: `${[prefix, access.outletName].map(asciiSlug).join("_")}_QR.zip`,
    contentType: "application/zip",
    body: zipSync(files),
  };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type PrintHtmlOptions = {
  areaId?: string;
  tableId?: string;
  template?: "stand" | "compact" | "badge";
  theme?: "royal" | "classic" | "dark";
};

/**
 * Print template: Balanced, elegant table QR cards ("ne çok detaylı, ne az detaylı").
 * Supports Stand (A6 Table Tent), Compact (A7 Card), and Badge (Square Sticker).
 */
export async function printHtml(ctx: Ctx, outletId: string, opts: PrintHtmlOptions = {}): Promise<string> {
  const access = await authorizeOutlet(ctx, outletId, "V");
  // White-listed again here: printHtml is callable without the route, and both go into the HTML.
  const template = parsePrintTemplate(opts.template) ?? "stand";
  const theme = parsePrintTheme(opts.theme) ?? "royal";
  const areaId = opts.areaId;
  const tableId = opts.tableId;

  const [tables, allAreas] = await Promise.all([
    activeQrTables(outletId, areaId, tableId),
    prisma.outletAreaDefinition.findMany({
      where: { outletId },
      select: { id: true, name: true, type: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const cards: string[] = [];
  for (const t of tables) {
    const svg = await renderQrSvg(await qrUrl(t.qrToken as string));
    const areaLabel = formatAreaLabel(t.area);

    if (template === "compact") {
      cards.push(
        `<div class="card" data-template="compact" data-theme="${theme}">
          <div class="compact-left">${svg}</div>
          <div class="compact-right">
            <div class="hotel-title">${esc(access.hotelName || "MERIT")}</div>
            <div class="outlet-title">${esc(access.outletName)}</div>
            <div class="area-pill">${esc(areaLabel)}</div>
            <div class="table-badge"><span class="label">${esc(t.label)}</span></div>
            <div class="cta-tr">Menü için kamerayla okutunuz</div>
            <div class="cta-en">Scan with camera for menu</div>
          </div>
        </div>`,
      );
    } else if (template === "badge") {
      cards.push(
        `<div class="card" data-template="badge" data-theme="${theme}">
          <div class="hotel-title">${esc(access.hotelName || "MERIT")}</div>
          <div class="outlet-title">${esc(access.outletName)}</div>
          <div class="badge-qr">${svg}</div>
          <div class="table-badge"><span class="label">${esc(t.label)}</span></div>
          <div class="cta-tr">${esc(areaLabel)} &bull; Menü için okutunuz</div>
        </div>`,
      );
    } else {
      // Default: stand (A6 Table Tent)
      cards.push(
        `<div class="card" data-template="stand" data-theme="${theme}">
          <div class="card-inner">
            <div class="hotel-title">${esc(access.hotelName || "MERIT ROYAL")}</div>
            <div class="outlet-title">
              <span>${esc(access.outletName)}</span>
              <span class="area-pill">${esc(areaLabel)}</span>
            </div>
            <div class="qr-box">${svg}</div>
            <div class="table-badge">
              <span class="sub">MASA &bull; TABLE</span>
              <span class="label">${esc(t.label)}</span>
            </div>
            <div class="cta-box">
              <div class="cta-tr">Menüyü incelemek ve sipariş için kameranızla okutunuz</div>
              <div class="cta-en">Scan with your camera to view menu &amp; order</div>
            </div>
          </div>
        </div>`,
      );
    }
  }

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(access.outletName)} - Masa QR Kartları</title>
<style>
*, *:before, *:after { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: #f1f5f9;
  color: #0f172a;
}
.print-toolbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  background: #1e293b;
  color: #f8fafc;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.bar-title strong { color: #f59e0b; }
.bar-count {
  background: rgba(255,255,255,0.15);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}
.bar-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.bar-controls label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
}
.bar-controls select {
  background: #334155;
  color: #fff;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  outline: none;
}
.btn-print {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #d97706;
  color: #fff;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn-print:hover { background: #b45309; }

.print-wrap {
  max-width: 210mm;
  margin: 16px auto;
  padding: 0;
}
.grid {
  display: grid;
  gap: 6mm;
  padding: 8mm;
  background: #ffffff;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  min-height: 280mm;
}
.grid[data-template="stand"] {
  grid-template-columns: repeat(2, 1fr);
  gap: 8mm;
  padding: 10mm;
}
.grid[data-template="compact"] {
  grid-template-columns: repeat(2, 1fr);
  gap: 5mm;
  padding: 6mm;
}
.grid[data-template="badge"] {
  grid-template-columns: repeat(3, 1fr);
  gap: 5mm;
  padding: 6mm;
}

.card {
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #999;
  border-radius: 8px;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
}

/* STAND */
.card[data-template="stand"] {
  min-height: 124mm;
  max-height: 132mm;
  padding: 6mm 5mm 5mm;
  border: 1.5px solid #d4af37;
}
.card[data-template="stand"] .card-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
}
.card[data-template="stand"] .hotel-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
.card[data-template="stand"] .outlet-title {
  font-size: 12px;
  font-weight: 600;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.card[data-template="stand"] .area-pill {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.card[data-template="stand"] .qr-box {
  margin: 4mm 0;
  padding: 2.5mm;
  background: #ffffff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card[data-template="stand"] svg {
  width: 44mm;
  height: 44mm;
  display: block;
}
.card[data-template="stand"] .table-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 16px;
  border-radius: 6px;
  margin-bottom: 3mm;
}
.card[data-template="stand"] .table-badge .sub {
  font-size: 8.5px;
  letter-spacing: 1px;
  font-weight: 700;
  opacity: 0.8;
}
.card[data-template="stand"] .table-badge .label {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
}
.card[data-template="stand"] .cta-box {
  width: 100%;
  padding-top: 3mm;
  border-top: 1px dashed rgba(0,0,0,0.15);
}
.card[data-template="stand"] .cta-tr {
  font-size: 10px;
  font-weight: 600;
}
.card[data-template="stand"] .cta-en {
  font-size: 8.5px;
  opacity: 0.75;
  margin-top: 1px;
}

/* COMPACT */
.card[data-template="compact"] {
  min-height: 60mm;
  max-height: 64mm;
  padding: 3mm 4mm;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 4mm;
}
.card[data-template="compact"] .compact-left svg {
  width: 32mm;
  height: 32mm;
  display: block;
}
.card[data-template="compact"] .compact-right {
  flex: 1;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.card[data-template="compact"] .hotel-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.card[data-template="compact"] .outlet-title {
  font-size: 11px;
  font-weight: 600;
}
.card[data-template="compact"] .area-pill {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid currentColor;
  width: fit-content;
}
.card[data-template="compact"] .table-badge .label {
  font-size: 16px;
  font-weight: 800;
}
.card[data-template="compact"] .cta-tr {
  font-size: 8.5px;
  font-weight: 600;
}
.card[data-template="compact"] .cta-en {
  font-size: 7.5px;
  opacity: 0.75;
}

/* BADGE */
.card[data-template="badge"] {
  min-height: 58mm;
  max-height: 62mm;
  padding: 3mm;
  justify-content: space-between;
}
.card[data-template="badge"] .hotel-title {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
}
.card[data-template="badge"] .outlet-title {
  font-size: 10px;
  font-weight: 600;
}
.card[data-template="badge"] svg {
  width: 28mm;
  height: 28mm;
  display: block;
}
.card[data-template="badge"] .table-badge .label {
  font-size: 14px;
  font-weight: 800;
}
.card[data-template="badge"] .cta-tr {
  font-size: 8px;
  font-weight: 500;
}

/* THEMES */
.card[data-theme="royal"] {
  border-color: #d4af37;
  color: #1e293b;
  background: #fdfbf7;
}
.card[data-theme="royal"] .hotel-title { color: #92400e; }
.card[data-theme="royal"] .area-pill {
  color: #b45309;
  border-color: #f59e0b;
  background: #fef3c7;
}
.card[data-theme="royal"] .table-badge {
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #78350f;
}
.card[data-theme="royal"] .qr-box { border: 1px solid #fde68a; }

.card[data-theme="classic"] {
  border-color: #334155;
  color: #0f172a;
  background: #ffffff;
}
.card[data-theme="classic"] .hotel-title { color: #0f172a; }
.card[data-theme="classic"] .area-pill {
  color: #475569;
  border-color: #cbd5e1;
  background: #f8fafc;
}
.card[data-theme="classic"] .table-badge {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #0f172a;
}
.card[data-theme="classic"] .qr-box { border: 1px solid #e2e8f0; }

.card[data-theme="dark"] {
  border-color: #e2b96f;
  color: #f8fafc;
  background: #0f172a;
}
.card[data-theme="dark"] .hotel-title { color: #f59e0b; }
.card[data-theme="dark"] .area-pill {
  color: #fde68a;
  border-color: #d97706;
  background: rgba(245, 158, 11, 0.15);
}
.card[data-theme="dark"] .table-badge {
  background: #1e293b;
  border: 1px solid #334155;
  color: #fbbf24;
}
.card[data-theme="dark"] .qr-box { background: #ffffff; }
.card[data-theme="dark"] .cta-box { border-top-color: rgba(255,255,255,0.15); }

.empty { padding: 24px; text-align: center; }

@page {
  size: A4 portrait;
  margin: 6mm;
}
@media print {
  .no-print { display: none !important; }
  body { background: #ffffff !important; margin: 0; padding: 0; }
  .print-wrap { max-width: 100% !important; margin: 0 !important; }
  .grid {
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    min-height: auto !important;
  }
  .card {
    box-shadow: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
</head>
<body>
<nav class="print-toolbar no-print">
  <div class="bar-left">
    <span class="bar-title">Masa QR Kartları: <strong>${esc(access.outletName)}</strong></span>
    <span class="bar-count">${tables.length} masa</span>
  </div>
  <div class="bar-controls">
    <label>
      <span>Şablon:</span>
      <select onchange="updateParam('template', this.value)">
        <option value="stand" ${template === "stand" ? "selected" : ""}>Masa Standı (A6 Dikey)</option>
        <option value="compact" ${template === "compact" ? "selected" : ""}>Kompakt Kart (A7 - 8'li)</option>
        <option value="badge" ${template === "badge" ? "selected" : ""}>Kare Etiket (12'li)</option>
      </select>
    </label>
    <label>
      <span>Tema:</span>
      <select onchange="updateParam('theme', this.value)">
        <option value="royal" ${theme === "royal" ? "selected" : ""}>Merit Royal (Altın &amp; Lüks)</option>
        <option value="classic" ${theme === "classic" ? "selected" : ""}>Klasik (Temiz Beyaz)</option>
        <option value="dark" ${theme === "dark" ? "selected" : ""}>Lounge (Koyu / Gece)</option>
      </select>
    </label>
    <label>
      <span>Alan:</span>
      <select onchange="updateParam('areaId', this.value)">
        <option value="">Tüm Alanlar</option>
        ${allAreas
          .map(
            (a) =>
              `<option value="${esc(a.id)}" ${areaId === a.id ? "selected" : ""}>${esc(formatAreaLabel(a))}</option>`,
          )
          .join("")}
      </select>
    </label>
    <button type="button" class="btn-print" onclick="window.print()">
      Yazdır / PDF Kaydet
    </button>
  </div>
</nav>

<div class="print-wrap">
${cards.length ? `<div class="grid" data-template="${template}">${cards.join("")}</div>` : `<p class="empty">QR kodu üretilmiş aktif masa bulunamadı.</p>`}
</div>

<script>
function updateParam(key, val) {
  var url = new URL(window.location.href);
  if (val) url.searchParams.set(key, val);
  else url.searchParams.delete(key);
  window.location.href = url.toString();
}
</script>
</body>
</html>`;
}
