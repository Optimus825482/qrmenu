"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { listQuerySchema, toPage, type ListQuery, type Page } from "@/modules/core/server/admin/listQuery";
import * as printers from "../server/printers";

const hotelId = z.string().min(1);
const id = z.string().min(1);
// The field rules (with field-level errors) live in the service schema.
const data = z.record(z.string(), z.unknown());

/** In-memory page over the hotel's printers: search on name/ip, sort on name. */
function pageOf(rows: printers.PrinterRow[], query: ListQuery): Page<printers.PrinterRow> {
  const q = query.q?.toLowerCase();
  const filtered = q
    ? rows.filter((row) => row.name.toLowerCase().includes(q) || row.ip.toLowerCase().includes(q))
    : rows;
  const { sort } = query;
  const sorted =
    sort?.field === "name"
      ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, "tr") * (sort.dir === "desc" ? -1 : 1))
      : filtered;
  return toPage(sorted, sorted.length, query);
}

export async function listPrintersAction(raw: unknown): Promise<Result<Page<printers.PrinterRow>>> {
  return safeAction(z.object({ hotelId, query: listQuerySchema.optional() }), async (input) => {
    const rows = await printers.list(await requireUser(), input.hotelId);
    return pageOf(rows, input.query ?? listQuerySchema.parse({}));
  })(raw);
}

export async function createPrinterAction(raw: unknown): Promise<Result<printers.PrinterRow>> {
  return safeAction(z.object({ hotelId, data }), async (input) =>
    printers.create(await requireUser(), input.hotelId, input.data as printers.PrinterInput),
  )(raw);
}

export async function updatePrinterAction(raw: unknown): Promise<Result<printers.PrinterRow>> {
  return safeAction(z.object({ id, data }), async (input) =>
    printers.update(await requireUser(), input.id, input.data as printers.PrinterInput),
  )(raw);
}

export async function setPrinterActiveAction(raw: unknown): Promise<Result<printers.PrinterRow>> {
  return safeAction(z.object({ id, isActive: z.boolean() }), async (input) =>
    printers.setActive(await requireUser(), input.id, input.isActive),
  )(raw);
}

export async function deletePrinterAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ id }), async (input) => {
    await printers.delete(await requireUser(), input.id);
    return null;
  })(raw);
}

export async function setOutletDefaultPrinterAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ outletId: id, printerId: id.nullable() }), async (input) => {
    await printers.setOutletDefault(await requireUser(), input.outletId, input.printerId);
    return null;
  })(raw);
}

/** The window's bottom panel: ordering outlets and their current default printer. */
export async function listOrderingOutletsAction(raw: unknown): Promise<Result<printers.OrderingOutlet[]>> {
  return safeAction(z.object({ hotelId: hotelId.optional() }), async (input) => {
    const ctx = await requireUser();
    return printers.listOrderingOutlets(ctx, input.hotelId ?? ctx.session.hotelId);
  })(raw);
}
