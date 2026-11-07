"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction } from "@/lib/result";
import { board } from "../roomService/board";

const outletId = z.string().min(1);

/** Staff room-service board of one outlet (hotel is derived from the outlet; RO-TAL view). */
export async function getRoomBoardAction(id: string) {
  return safeAction(outletId, async (value) => board.get(await requireUser(), value))(id);
}
