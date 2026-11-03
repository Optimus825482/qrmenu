"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { getRoutines, type RoutineStatus } from "./routines";

/** The signed-in user's own routines (no screen permission: items are filtered by what the user may view). */
export async function getRoutinesAction(): Promise<Result<RoutineStatus[]>> {
  return safeAction(z.undefined(), async () => getRoutines(await requireUser()))(undefined);
}
