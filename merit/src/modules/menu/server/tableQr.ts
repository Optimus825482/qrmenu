import { zipSync } from "fflate";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateQrToken, isSignedToken, qrUrl, renderQrPng, renderQrSvg, verifyQrToken } from "@/lib/qr";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope } from "./menuNodeAccess";
import { qrPrintCard, qrPrintPage } from "@/lib/qrPrintPage";
import { parsePrintTemplate, parsePrintTheme } from "./printOptions";
import { type QrPdfCard, renderQrCardsPdf } from "@/lib/qrPdf";

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

const TABLE_PDF_FOOTER: [string, string] = [
  "Menüyü incelemek ve sipariş için kameranızla okutunuz",
  "Scan with your camera to view menu & order",
];

async function tablePdfCards(access: Access, areaId?: string): Promise<QrPdfCard[]> {
  const tables = await activeQrTables(access.outletId, areaId);
  const cards: QrPdfCard[] = [];
  for (const t of tables) {
    cards.push({
      heading: access.hotelName || "Merit Royal",
      sub: `${access.outletName} · ${formatAreaLabel(t.area)}`,
      caption: "MASA • TABLE",
      label: t.label,
      url: await qrUrl(t.qrToken as string),
      footer: TABLE_PDF_FOOTER,
    });
  }
  return cards;
}

/** Print-ready PDF (A4, six cards a page) of one outlet's active table QR codes (`QM-MEN V`). */
export async function outletPdf(ctx: Ctx, outletId: string, opts?: { areaId?: string }): Promise<QrFile> {
  const access = await authorizeOutlet(ctx, outletId, "V");
  const cards = await tablePdfCards(access, opts?.areaId);
  if (cards.length === 0) throw new DomainError("CONFLICT", "QR kodu üretilmiş aktif masa yok");
  const prefix = hotelPrefix(access.hotelCode);
  return {
    filename: `${[prefix, access.outletName].map(asciiSlug).join("_")}_QR.pdf`,
    contentType: "application/pdf",
    body: new Uint8Array(await renderQrCardsPdf(`${access.outletName} - Masa QR Kartları`, cards)),
  };
}

/** Outlets of the hotel that have tables and that the caller may act on (`QM-MEN action`), by name. */
async function hotelTableOutlets(ctx: Ctx, hotelId: string, action: "V" | "D"): Promise<Access[]> {
  await assertCan(ctx, "QM-MEN", action, hotelId);
  const outlets = await prisma.outlet.findMany({
    where: { hotelId, tables: { some: {} } },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  const allowed: Access[] = [];
  for (const outlet of outlets) {
    try {
      allowed.push(await authorizeOutlet(ctx, outlet.id, action));
    } catch (error) {
      // An outlet-scoped user simply does not get the other outlets.
      if (!(error instanceof DomainError)) throw error;
    }
  }
  return allowed;
}

/** One PDF with the active table QR codes of every outlet of the hotel the caller can see. */
export async function hotelPdf(ctx: Ctx, hotelId: string): Promise<QrFile> {
  const outlets = await hotelTableOutlets(ctx, hotelId, "V");
  const cards: QrPdfCard[] = [];
  for (const access of outlets) cards.push(...(await tablePdfCards(access)));
  if (cards.length === 0) throw new DomainError("CONFLICT", "QR kodu üretilmiş aktif masa yok");
  const first = outlets[0];
  return {
    filename: `${asciiSlug(hotelPrefix(first?.hotelCode ?? "MERIT"))}_Tum_Masa_QR.pdf`,
    contentType: "application/pdf",
    body: new Uint8Array(await renderQrCardsPdf(`${first?.hotelName ?? "Merit"} - Masa QR Kartları`, cards)),
  };
}

/** New signed tokens for every table of every outlet of the hotel the caller may edit; old prints stop working. */
export async function regenerateHotel(ctx: Ctx, hotelId: string): Promise<{ count: number; outlets: number }> {
  const outlets = await hotelTableOutlets(ctx, hotelId, "D");
  if (outlets.length === 0) throw new DomainError("NOT_FOUND", "Masası olan bir outlet bulunamadı");
  let count = 0;
  for (const access of outlets) count += (await regenerateAll(ctx, access.outletId)).count;
  return { count, outlets: outlets.length };
}

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
    const areaLabel = formatAreaLabel(t.area);
    cards.push(
      qrPrintCard(template, theme, {
        hotel: access.hotelName || "MERIT ROYAL",
        title: access.outletName,
        pill: areaLabel,
        caption: "MASA &bull; TABLE",
        label: t.label,
        svg: await renderQrSvg(await qrUrl(t.qrToken as string)),
        ctaTr: "Menüyü incelemek ve sipariş için kameranızla okutunuz",
        ctaEn: "Scan with your camera to view menu &amp; order",
        ctaShortTr: "Menü için kamerayla okutunuz",
        ctaShortEn: "Scan with camera for menu",
        ctaBadge: "Menü için okutunuz",
      }),
    );
  }

  return qrPrintPage({
    title: `${access.outletName} - Masa QR Kartları`,
    barTitle: "Masa QR Kartları",
    barName: access.outletName,
    count: `${tables.length} masa`,
    template,
    theme,
    cards,
    filter: {
      label: "Alan",
      param: "areaId",
      all: "Tüm Alanlar",
      value: areaId,
      options: allAreas.map((a) => ({ id: a.id, label: formatAreaLabel(a) })),
    },
    empty: "QR kodu üretilmiş aktif masa bulunamadı.",
  });
}
