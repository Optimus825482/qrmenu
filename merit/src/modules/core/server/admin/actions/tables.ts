"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { listQuerySchema, type Page } from "../crud";
import * as tables from "../tables";

const outletId = z.string().min(1);
const id = z.string().min(1);
// The field values are validated (with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listTablesAction(raw: unknown): Promise<Result<Page<tables.TableRow>>> {
  return safeAction(z.object({ outletId, query: listQuerySchema }), async (input) =>
    tables.list(await requireUser(), input.outletId, input.query),
  )(raw);
}

export async function createTableAction(raw: unknown): Promise<Result<tables.TableRow>> {
  return safeAction(z.object({ outletId, data }), async (input) =>
    tables.create(await requireUser(), input.outletId, input.data as tables.TableInput),
  )(raw);
}

export async function updateTableAction(raw: unknown): Promise<Result<tables.TableRow>> {
  return safeAction(z.object({ outletId, id, data }), async (input) =>
    tables.update(await requireUser(), input.outletId, input.id, input.data as tables.TableInput),
  )(raw);
}

export async function deleteTableAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ outletId, id }), async (input) => {
    await tables.remove(await requireUser(), input.outletId, input.id);
    return null;
  })(raw);
}

export async function bulkCreateTablesAction(raw: unknown): Promise<Result<tables.BulkResult>> {
  return safeAction(z.object({ outletId, data }), async (input) =>
    tables.bulkCreate(await requireUser(), input.outletId, input.data as tables.BulkInput),
  )(raw);
}
