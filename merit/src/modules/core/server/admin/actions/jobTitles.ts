"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import type { Page } from "../crud";
import { listQuerySchema } from "../crud";
import * as jobTitles from "../jobTitles";

const id = z.string().min(1);
// The field values are validated (with field-level errors) by the service itself.
const data = z.record(z.string(), z.unknown());

export async function listJobTitlesAction(raw: unknown): Promise<Result<Page<jobTitles.JobTitleRow>>> {
  return safeAction(listQuerySchema, async (query) => jobTitles.list(await requireUser(), query))(raw);
}

export async function jobTitleOptionsAction(): Promise<Result<jobTitles.JobTitleOptions>> {
  return safeAction(z.undefined(), async () => jobTitles.options(await requireUser()))(undefined);
}

export async function createJobTitleAction(raw: unknown): Promise<Result<jobTitles.JobTitleRow>> {
  return safeAction(z.object({ data }), async (input) =>
    jobTitles.create(await requireUser(), input.data as jobTitles.JobTitleInput),
  )(raw);
}

export async function updateJobTitleAction(raw: unknown): Promise<Result<jobTitles.JobTitleRow>> {
  return safeAction(z.object({ id, data }), async (input) =>
    jobTitles.update(await requireUser(), input.id, input.data as jobTitles.JobTitleInput),
  )(raw);
}

export async function deleteJobTitleAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ id }), async (input) => {
    await jobTitles.remove(await requireUser(), input.id);
    return null;
  })(raw);
}
