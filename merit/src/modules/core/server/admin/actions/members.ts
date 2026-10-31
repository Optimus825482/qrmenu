"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import type { Page } from "../crud";
import * as members from "../members";

const id = z.string().min(1);
const outletId = z.string().min(1);

export async function listMembersAction(raw: unknown): Promise<Result<Page<members.MemberRow>>> {
  return safeAction(z.object({ outletId, query: members.memberListQuerySchema }), async (input) =>
    members.list(await requireUser(), input.outletId, input.query),
  )(raw);
}

export async function memberCandidatesAction(raw: unknown): Promise<Result<members.MemberCandidate[]>> {
  return safeAction(z.object({ outletId, q: z.string().max(100).optional() }), async (input) =>
    members.candidates(await requireUser(), input.outletId, input.q),
  )(raw);
}

export async function assignMemberAction(raw: unknown): Promise<Result<members.MemberRow>> {
  return safeAction(z.record(z.string(), z.unknown()), async (input) =>
    members.assign(await requireUser(), input as members.AssignInput),
  )(raw);
}

export async function setMemberActiveAction(raw: unknown): Promise<Result<members.MemberRow>> {
  return safeAction(z.object({ id, isActive: z.boolean() }), async (input) =>
    members.setActive(await requireUser(), input.id, input.isActive),
  )(raw);
}

export async function removeMemberAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ id }), async (input) => {
    await members.remove(await requireUser(), input.id);
    return null;
  })(raw);
}
