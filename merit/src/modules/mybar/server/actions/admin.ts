"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import {
  capabilities,
  exportRequests,
  type MybarCapabilities,
  type MybarExportFile,
  mybarExportSchema,
} from "../adminViews";

const hotelIdOptSchema = z.string().min(1).max(64).optional();

export async function mybarCapabilitiesAction(hotelId?: string): Promise<Result<MybarCapabilities>> {
  return safeAction(hotelIdOptSchema, async (hid) => capabilities(await requireUser(), hid))(hotelId);
}

export async function exportMybarAction(input: z.input<typeof mybarExportSchema>): Promise<Result<MybarExportFile>> {
  return safeAction(mybarExportSchema, async (valid) => exportRequests(await requireUser(), valid))(input);
}
