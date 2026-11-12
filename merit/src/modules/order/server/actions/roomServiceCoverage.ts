"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { board, type CoveredBoard } from "../roomService/board";
import { coverage, type CoverageOverview, type CoverageRow } from "../roomService/coverage";

/** Open room-service requests of the hotels the caller covers right now (empty without an active grant). */
export async function getCoveredBoardAction(): Promise<Result<CoveredBoard>> {
  return safeAction(z.undefined(), async () => board.covered(await requireUser()))(undefined);
}

/** "Oteller Arası Oda Servisi" window: managed hotels, grants and the users that may be granted. */
export async function listCoverageAction(): Promise<Result<CoverageOverview>> {
  return safeAction(z.undefined(), async () => coverage.list(await requireUser()))(undefined);
}

// The service validates the payload itself (coverage.grant / coverage.revoke): one schema, one place.
export async function grantCoverageAction(raw: unknown): Promise<Result<CoverageRow>> {
  return safeAction(z.unknown(), async (input) => coverage.grant(await requireUser(), input))(raw);
}

export async function revokeCoverageAction(raw: unknown): Promise<Result<CoverageRow>> {
  return safeAction(z.unknown(), async (input) => coverage.revoke(await requireUser(), input))(raw);
}
