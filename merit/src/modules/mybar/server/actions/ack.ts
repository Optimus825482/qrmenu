"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { shouldShowAckHost } from "../ackPolicy";
import { listUnseen, type MybarRow } from "../requests";

/** Unseen requests for the mandatory acknowledgement dialog; empty for sessions that are not bound to it. */
export async function listUnseenForAckAction(): Promise<Result<MybarRow[]>> {
  return safeAction(z.undefined(), async () => {
    const ctx = await requireUser();
    if (!(await shouldShowAckHost(ctx))) return [];
    return listUnseen(ctx);
  })(undefined);
}
