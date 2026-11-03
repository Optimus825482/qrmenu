import type { MybarStatus, Prisma } from "@/generated/prisma/client";
import { publish } from "@/lib/realtime";
import { MYBAR_EVENTS, MYBAR_EVENT_ROLE_KINDS } from "./constants";

export { MYBAR_EVENTS };
export type MybarEventType = (typeof MYBAR_EVENTS)[number];

/** Transactional publication: no lifecycle event escapes a rolled-back write. */
export function publishMybar(
  tx: Prisma.TransactionClient,
  type: MybarEventType,
  req: {
    hotelId: string;
    roomId: string;
    roomNumber: string;
    id: string;
    status: MybarStatus;
    byUserId?: string;
    closedWithMissing?: boolean;
    waitSec?: number;
  },
): Promise<void> {
  return publish({
    type,
    hotelId: req.hotelId,
    roomId: req.roomId,
    roleKinds: MYBAR_EVENT_ROLE_KINDS,
    payload: {
      requestId: req.id,
      roomId: req.roomId,
      roomNumber: req.roomNumber,
      status: req.status,
      ...(req.byUserId ? { byUserId: req.byUserId } : {}),
      ...(req.closedWithMissing !== undefined ? { closedWithMissing: req.closedWithMissing } : {}),
      ...(req.waitSec !== undefined ? { waitSec: req.waitSec } : {}),
    },
  }, tx);
}
