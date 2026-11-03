"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { fulfill, type FulfillInput, fulfillInputSchema, type FulfillResult } from "../fulfill";

const schema = z.object({ requestId: z.string().min(1).max(64), input: fulfillInputSchema });

export async function fulfillMybarAction(
  requestId: string,
  input: FulfillInput,
): Promise<Result<FulfillResult>> {
  return safeAction(schema, async (v) => fulfill(await requireUser(), v.requestId, v.input))({ requestId, input });
}
